import type {
  ChangeCategory,
  FileChangeAnalysis,
} from "../models/change-analysis";
import type {
  ExplorationFramework,
  FrameworkSelection,
} from "../models/risk-assessment";
import {
  type CoverageGapEntry,
  EXPLORATION_PRIORITY_ORDER,
  type ExplorationPriority,
} from "../models/test-mapping";

/**
 * Maps change categories to the exploration frameworks most relevant to them.
 * Each entry explains *why* that framework is a good fit.
 */
const CATEGORY_FRAMEWORK_RULES: readonly {
  readonly categories: readonly ChangeCategory[];
  readonly framework: ExplorationFramework;
  readonly reason: string;
  readonly priority: ExplorationPriority;
}[] = [
  {
    categories: ["validation", "api", "schema"],
    framework: "boundary-value-analysis",
    reason:
      "Input validation, API contracts, or schema constraints benefit from boundary testing",
    priority: "high",
  },
  {
    categories: ["validation", "api"],
    framework: "equivalence-partitioning",
    reason:
      "Input handling changes benefit from equivalence class identification",
    priority: "medium",
  },
  {
    categories: ["state-transition"],
    framework: "state-transition",
    reason:
      "State management changes require verifying all valid/invalid transitions",
    priority: "high",
  },
  {
    categories: ["permission", "async", "cross-service"],
    framework: "error-guessing",
    reason:
      "Security, async, and cross-service changes are prone to subtle edge-case failures",
    priority: "high",
  },
  {
    categories: ["feature-flag"],
    framework: "pairwise",
    reason:
      "Feature flag combinations benefit from pairwise interaction testing",
    priority: "medium",
  },
  {
    categories: ["ui"],
    framework: "equivalence-partitioning",
    reason:
      "UI variations (viewport, theme, locale) can be grouped into equivalence classes",
    priority: "low",
  },
  {
    categories: ["ui"],
    framework: "sampling",
    reason:
      "UI rendering across many device/browser combinations benefits from sampling",
    priority: "low",
  },
  {
    categories: ["cross-service", "schema"],
    framework: "cause-effect-graph",
    reason:
      "Cross-service and schema changes involve causal dependencies worth mapping",
    priority: "medium",
  },
  {
    categories: ["async"],
    framework: "state-transition",
    reason:
      "Async processing involves lifecycle states (pending, running, failed, done)",
    priority: "medium",
  },
  {
    categories: ["shared-component"],
    framework: "sampling",
    reason:
      "Shared module changes affect many consumers; sampling covers representative use cases",
    priority: "medium",
  },
];

/** Minimum number of distinct categories on a single file to trigger decision-table. */
const DECISION_TABLE_CATEGORY_THRESHOLD = 3;

export function selectFrameworks(
  fileAnalyses: readonly FileChangeAnalysis[],
  coverageGaps: readonly CoverageGapEntry[],
): readonly FrameworkSelection[] {
  if (fileAnalyses.length === 0) {
    return [];
  }

  // Accumulate framework → files mapping, taking highest priority seen
  const accumulator = new Map<
    ExplorationFramework,
    { files: Set<string>; reason: string; priority: ExplorationPriority }
  >();

  const allCategories = new Set<ChangeCategory>();

  for (const file of fileAnalyses) {
    const fileCategories = new Set(file.categories.map((c) => c.category));

    for (const category of fileCategories) {
      allCategories.add(category);
    }

    // Check category-based rules
    for (const rule of CATEGORY_FRAMEWORK_RULES) {
      const matched = rule.categories.some((c) => fileCategories.has(c));
      if (matched) {
        mergeSelection(
          accumulator,
          rule.framework,
          file.path,
          rule.reason,
          rule.priority,
        );
      }
    }

    // Decision-table trigger: many categories on one file
    if (fileCategories.size >= DECISION_TABLE_CATEGORY_THRESHOLD) {
      mergeSelection(
        accumulator,
        "decision-table",
        file.path,
        "Multiple change categories co-exist, requiring decision table analysis of combined conditions",
        "high",
      );
    }
  }

  // Gap-driven selection: if uncovered aspects exist, add equivalence-partitioning
  const uncoveredFiles = new Set<string>();
  for (const gap of coverageGaps) {
    if (gap.status === "uncovered") {
      uncoveredFiles.add(gap.changedFilePath);
    }
  }

  if (uncoveredFiles.size > 0) {
    for (const filePath of uncoveredFiles) {
      mergeSelection(
        accumulator,
        "equivalence-partitioning",
        filePath,
        "Uncovered test aspects suggest equivalence class identification",
        "medium",
      );
    }
  }

  const selections = [...accumulator.entries()].map(([framework, data]) => ({
    framework,
    reason: data.reason,
    relevantFiles: [...data.files].sort(),
    priority: data.priority,
  }));

  // Sort by priority descending for deterministic output
  selections.sort(
    (a, b) =>
      EXPLORATION_PRIORITY_ORDER[b.priority] -
      EXPLORATION_PRIORITY_ORDER[a.priority],
  );

  return selections;
}

function mergeSelection(
  accumulator: Map<
    ExplorationFramework,
    { files: Set<string>; reason: string; priority: ExplorationPriority }
  >,
  framework: ExplorationFramework,
  filePath: string,
  reason: string,
  priority: ExplorationPriority,
): void {
  const existing = accumulator.get(framework);
  if (existing) {
    existing.files.add(filePath);
    // Keep the highest priority and its associated reason
    if (
      EXPLORATION_PRIORITY_ORDER[priority] >
      EXPLORATION_PRIORITY_ORDER[existing.priority]
    ) {
      existing.priority = priority;
      existing.reason = reason;
    }
  } else {
    accumulator.set(framework, {
      files: new Set([filePath]),
      reason,
      priority,
    });
  }
}
