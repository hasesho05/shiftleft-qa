import type { PersistedAllocationItem } from "../db/workspace-repository";
import {
  DEFAULT_ESTIMATED_MINUTES,
  type DroppedItem,
  PROTECTED_RISK_SIGNALS,
  type PruningResult,
} from "../models/pruning";
import type { ExplorationTheme } from "../models/risk-assessment";
import type { ExplorationPriority } from "../models/test-mapping";

export type PruningInput = {
  readonly manualItems: readonly PersistedAllocationItem[];
  readonly devBoxItems: readonly PersistedAllocationItem[];
  readonly themes: readonly ExplorationTheme[];
  readonly budgetMinutes: number;
};

type ScoredItem = {
  readonly item: PersistedAllocationItem;
  readonly estimatedMinutes: number;
  readonly isProtected: boolean;
};

const RISK_ORDER: Record<ExplorationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function pruneManualExplorationItems(
  input: PruningInput,
): PruningResult {
  if (input.manualItems.length === 0) {
    return {
      selectedItemIds: [],
      droppedItems: [],
      totalEstimatedMinutes: 0,
      budgetMinutes: input.budgetMinutes,
      budgetUsedMinutes: 0,
    };
  }

  // Phase 1: P4 — remove dev-box covered items (before dedup)
  const { remaining: afterDevBox, dropped: devBoxDropped } =
    applyDevBoxExclusion(input.manualItems, input.devBoxItems);

  // Phase 2: P1 — merge duplicates (same file + overlapping risk signals)
  const { remaining: afterDedup, dropped: dedupDropped } =
    applyDuplicateMerging(afterDevBox);

  // Score items with estimated minutes from themes
  const scored = afterDedup.map((item) => scoreItem(item, input.themes));

  // Phase 3: Sort by risk level (P2) — high → medium → low
  scored.sort(
    (a, b) => RISK_ORDER[b.item.riskLevel] - RISK_ORDER[a.item.riskLevel],
  );

  const totalEstimatedMinutes = scored.reduce(
    (sum, s) => sum + s.estimatedMinutes,
    0,
  );

  // Phase 4: P3 + P5 — apply budget constraint with protected signal preservation
  const { selected, dropped: budgetDropped } = applyBudgetConstraint(
    scored,
    input.budgetMinutes,
  );

  const allDropped = [...devBoxDropped, ...dedupDropped, ...budgetDropped];
  const budgetUsedMinutes = selected.reduce(
    (sum, s) => sum + s.estimatedMinutes,
    0,
  );

  return {
    selectedItemIds: selected.map((s) => s.item.id),
    droppedItems: allDropped,
    totalEstimatedMinutes,
    budgetMinutes: input.budgetMinutes,
    budgetUsedMinutes,
  };
}

function applyDevBoxExclusion(
  manualItems: readonly PersistedAllocationItem[],
  devBoxItems: readonly PersistedAllocationItem[],
): {
  remaining: readonly PersistedAllocationItem[];
  dropped: readonly DroppedItem[];
} {
  if (devBoxItems.length === 0) {
    return { remaining: manualItems, dropped: [] };
  }

  const devBoxIndex = buildFileAspectIndex(devBoxItems);
  const remaining: PersistedAllocationItem[] = [];
  const dropped: DroppedItem[] = [];

  for (const item of manualItems) {
    if (hasProtectedSignal(item) || !isDevBoxCovered(item, devBoxIndex)) {
      remaining.push(item);
    } else {
      dropped.push(toDroppedItem(item, "dev-box-covered"));
    }
  }

  return { remaining, dropped };
}

function applyDuplicateMerging(items: readonly PersistedAllocationItem[]): {
  remaining: readonly PersistedAllocationItem[];
  dropped: readonly DroppedItem[];
} {
  const fileGroups = new Map<string, PersistedAllocationItem[]>();

  for (const item of items) {
    const key = item.changedFilePaths.slice().sort().join("\0");
    const group = fileGroups.get(key) ?? [];
    group.push(item);
    fileGroups.set(key, group);
  }

  const remaining: PersistedAllocationItem[] = [];
  const dropped: DroppedItem[] = [];

  for (const group of fileGroups.values()) {
    if (group.length <= 1) {
      remaining.push(...group);
      continue;
    }

    // Check for overlapping risk signals within the group
    const signalGroups = groupByOverlappingSignals(group);

    for (const signalGroup of signalGroups) {
      if (signalGroup.length <= 1) {
        remaining.push(...signalGroup);
        continue;
      }

      // Keep the highest-risk item, drop the rest
      signalGroup.sort(
        (a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel],
      );
      remaining.push(signalGroup[0]);
      for (const dupItem of signalGroup.slice(1)) {
        dropped.push(toDroppedItem(dupItem, "duplicate"));
      }
    }
  }

  return { remaining, dropped };
}

function groupByOverlappingSignals(
  items: readonly PersistedAllocationItem[],
): PersistedAllocationItem[][] {
  // Greedy grouping: items share a group if they have overlapping riskSignals (transitive via group merge)
  const groups: { items: PersistedAllocationItem[]; signals: Set<string> }[] =
    [];

  for (const item of items) {
    const itemSignals = item.sourceSignals.riskSignals;
    let merged = false;

    if (itemSignals.length > 0) {
      for (const group of groups) {
        if (itemSignals.some((s) => group.signals.has(s))) {
          group.items.push(item);
          for (const s of itemSignals) {
            group.signals.add(s);
          }
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      groups.push({
        items: [item],
        signals: new Set(itemSignals),
      });
    }
  }

  return groups.map((g) => g.items);
}

function applyBudgetConstraint(
  scored: readonly ScoredItem[],
  budgetMinutes: number,
): {
  selected: readonly ScoredItem[];
  dropped: readonly DroppedItem[];
} {
  // Separate into: high (never dropped), protected (never dropped), and droppable
  const neverDrop: ScoredItem[] = [];
  const droppable: ScoredItem[] = [];

  for (const item of scored) {
    if (item.item.riskLevel === "high" || item.isProtected) {
      neverDrop.push(item);
    } else {
      droppable.push(item);
    }
  }

  const neverDropMinutes = neverDrop.reduce(
    (sum, s) => sum + s.estimatedMinutes,
    0,
  );
  let remainingBudget = budgetMinutes - neverDropMinutes;

  // Sort droppable: least droppable first (medium low-confidence), most droppable last (low).
  // Greedy fit processes in this order, so higher-value items claim budget first.
  const prioritized = [...droppable].sort((a, b) => {
    const riskDiff =
      RISK_ORDER[b.item.riskLevel] - RISK_ORDER[a.item.riskLevel];
    if (riskDiff !== 0) {
      return riskDiff; // medium before low
    }
    // Within same risk level, low confidence first (further from automation → more manual value)
    return a.item.confidence - b.item.confidence;
  });

  const selected: ScoredItem[] = [...neverDrop];
  const dropped: DroppedItem[] = [];

  const fittingItems: ScoredItem[] = [];
  const overflowItems: ScoredItem[] = [];

  for (const item of prioritized) {
    if (item.estimatedMinutes <= remainingBudget) {
      fittingItems.push(item);
      remainingBudget -= item.estimatedMinutes;
    } else {
      overflowItems.push(item);
    }
  }

  selected.push(...fittingItems);

  for (const item of overflowItems) {
    dropped.push(
      toDroppedItem(item.item, "budget-exceeded", item.estimatedMinutes),
    );
  }

  return { selected, dropped };
}

function scoreItem(
  item: PersistedAllocationItem,
  themes: readonly ExplorationTheme[],
): ScoredItem {
  const estimatedMinutes = resolveEstimatedMinutes(item, themes);
  const isProtected = hasProtectedSignal(item);

  return { item, estimatedMinutes, isProtected };
}

function resolveEstimatedMinutes(
  item: PersistedAllocationItem,
  themes: readonly ExplorationTheme[],
): number {
  // Try to find a matching theme by file overlap
  const matchingTheme = themes.find((theme) =>
    theme.targetFiles.some((file) => item.changedFilePaths.includes(file)),
  );

  if (matchingTheme) {
    return matchingTheme.estimatedMinutes;
  }

  return DEFAULT_ESTIMATED_MINUTES[item.riskLevel];
}

function hasProtectedSignal(item: PersistedAllocationItem): boolean {
  return item.sourceSignals.riskSignals.some((signal) =>
    PROTECTED_RISK_SIGNALS.some((protectedSignal) =>
      signal.includes(protectedSignal),
    ),
  );
}

function buildFileAspectIndex(
  items: readonly PersistedAllocationItem[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const item of items) {
    for (const filePath of item.changedFilePaths) {
      const aspects = index.get(filePath) ?? new Set();
      for (const aspect of item.sourceSignals.gapAspects) {
        aspects.add(aspect);
      }
      index.set(filePath, aspects);
    }
  }

  return index;
}

function isDevBoxCovered(
  item: PersistedAllocationItem,
  devBoxIndex: Map<string, Set<string>>,
): boolean {
  if (item.changedFilePaths.length === 0) {
    return false;
  }

  // Item is covered if ALL its files+aspects are covered by dev-box
  for (const filePath of item.changedFilePaths) {
    const devBoxAspects = devBoxIndex.get(filePath);
    if (!devBoxAspects) {
      return false;
    }

    const itemAspects = item.sourceSignals.gapAspects;
    if (itemAspects.length === 0) {
      continue;
    }

    const allCovered = itemAspects.every((aspect) => devBoxAspects.has(aspect));
    if (!allCovered) {
      return false;
    }
  }

  return true;
}

function toDroppedItem(
  item: PersistedAllocationItem,
  reason: DroppedItem["reason"],
  resolvedMinutes?: number,
): DroppedItem {
  return {
    title: item.title,
    changedFilePaths: [...item.changedFilePaths],
    riskLevel: item.riskLevel,
    reason,
    estimatedMinutes:
      resolvedMinutes ?? DEFAULT_ESTIMATED_MINUTES[item.riskLevel],
  };
}
