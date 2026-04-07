import type { PersistedAllocationItem } from "../db/workspace-repository";
import type { AllocationDestination } from "../models/allocation";
import type {
  CoverageAspect,
  ExplorationPriority,
} from "../models/test-mapping";

export type GroupedAllocationItem = {
  readonly groupKey: string;
  readonly mergedTitle: string;
  readonly mergedRationale: string;
  readonly items: readonly PersistedAllocationItem[];
  readonly combinedAspects: readonly CoverageAspect[];
  readonly destination: AllocationDestination;
  readonly riskLevel: ExplorationPriority;
  readonly confidence: number;
  readonly changedFilePaths: readonly string[];
};

const RISK_ORDER: Record<ExplorationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Groups raw allocation items into coarser entries suitable for handoff rendering.
 *
 * - Non-manual items: grouped by `${destination}:${filePath}` (merge same file + same destination)
 * - Manual items (manual-exploration, dev-box): grouped by `${destination}:${directoryPrefix}`
 *   where directoryPrefix is the first two path segments
 */
export function groupAllocationItems(
  items: readonly PersistedAllocationItem[],
): readonly GroupedAllocationItem[] {
  const groups = new Map<string, PersistedAllocationItem[]>();

  for (const item of items) {
    const key = deriveGroupKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const result: GroupedAllocationItem[] = [];

  for (const [groupKey, groupItems] of groups.entries()) {
    const destination = groupItems[0].recommendedDestination;
    const allAspects = new Set<CoverageAspect>();
    const allPaths = new Set<string>();
    let maxRisk: ExplorationPriority = "low";
    let minConfidence = 1;

    for (const item of groupItems) {
      for (const aspect of item.sourceSignals.gapAspects) {
        allAspects.add(aspect);
      }
      for (const path of item.changedFilePaths) {
        allPaths.add(path);
      }
      if (RISK_ORDER[item.riskLevel] > RISK_ORDER[maxRisk]) {
        maxRisk = item.riskLevel;
      }
      if (item.confidence < minConfidence) {
        minConfidence = item.confidence;
      }
    }

    const combinedAspects = [...allAspects].sort();
    const changedFilePaths = [...allPaths].sort();

    result.push({
      groupKey,
      mergedTitle: buildMergedTitle(
        destination,
        changedFilePaths,
        combinedAspects,
      ),
      mergedRationale: buildMergedRationale(groupItems),
      items: groupItems,
      combinedAspects,
      destination,
      riskLevel: maxRisk,
      confidence: minConfidence,
      changedFilePaths,
    });
  }

  return result;
}

function deriveGroupKey(item: PersistedAllocationItem): string {
  const destination = item.recommendedDestination;
  const filePath = item.changedFilePaths[0] ?? "unknown";

  if (destination === "manual-exploration" || destination === "dev-box") {
    const prefix = deriveDirectoryPrefix(filePath);
    return `${destination}:${prefix}`;
  }

  return `${destination}:${filePath}`;
}

export function deriveDirectoryPrefix(filePath: string): string {
  const segments = filePath.split("/");
  if (segments.length >= 3) {
    return `${segments[0]}/${segments[1]}`;
  }
  if (segments.length === 2) {
    return segments[0];
  }
  return filePath;
}

function buildMergedTitle(
  destination: AllocationDestination,
  filePaths: readonly string[],
  aspects: readonly CoverageAspect[],
): string {
  const aspectSuffix = aspects.length > 0 ? ` (${aspects.join(", ")})` : "";
  const fileDesc =
    filePaths.length === 1
      ? filePaths[0]
      : `${filePaths.length} files in ${deriveDirectoryPrefix(filePaths[0])}`;

  switch (destination) {
    case "manual-exploration":
      return `Manual exploration: ${fileDesc}${aspectSuffix}`;
    case "dev-box":
      return `Dev-box check: ${fileDesc}${aspectSuffix}`;
    case "review":
      return `Review: ${fileDesc}${aspectSuffix}`;
    case "unit":
      return `Unit coverage: ${fileDesc}${aspectSuffix}`;
    case "integration":
      return `Integration coverage: ${fileDesc}${aspectSuffix}`;
    case "e2e":
      return `E2E coverage: ${fileDesc}${aspectSuffix}`;
    case "visual":
      return `Visual coverage: ${fileDesc}${aspectSuffix}`;
    case "skip":
      return `Already covered: ${fileDesc}${aspectSuffix}`;
  }
}

function buildMergedRationale(
  items: readonly PersistedAllocationItem[],
): string {
  const uniqueRationales = [...new Set(items.map((item) => item.rationale))];
  if (uniqueRationales.length === 1) {
    return uniqueRationales[0];
  }
  return uniqueRationales.slice(0, 3).join(" | ");
}
