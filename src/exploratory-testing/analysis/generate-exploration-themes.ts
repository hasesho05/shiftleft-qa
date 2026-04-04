import type { IntentContext } from "../models/intent-context";
import type {
  ExplorationFramework,
  ExplorationTheme,
  FrameworkSelection,
  RiskScore,
} from "../models/risk-assessment";
import {
  type CoverageAspect,
  type CoverageGapEntry,
  EXPLORATION_PRIORITY_ORDER,
  type ExplorationPriority,
} from "../models/test-mapping";

const FRAMEWORK_LABELS: Record<ExplorationFramework, string> = {
  "equivalence-partitioning": "Equivalence Partitioning",
  "boundary-value-analysis": "Boundary Value Analysis",
  "state-transition": "State Transition",
  "decision-table": "Decision Table",
  "cause-effect-graph": "Cause-Effect Graph",
  pairwise: "Pairwise",
  sampling: "Sampling",
  "error-guessing": "Error Guessing",
};

const TIMEBOX_BY_PRIORITY: Record<ExplorationPriority, number> = {
  high: 20,
  medium: 15,
  low: 10,
};

const HIGH_RISK_THRESHOLD = 0.65;

const ASPECT_LABELS: Record<CoverageAspect, string> = {
  "happy-path": "happy path",
  "error-path": "error handling",
  boundary: "boundary cases",
  permission: "permission differences",
  "state-transition": "state transitions",
  "mock-fixture": "fixture and integration assumptions",
};

const ASPECT_FRAMEWORK_FALLBACKS: Record<
  CoverageAspect,
  readonly ExplorationFramework[]
> = {
  "happy-path": ["sampling"],
  "error-path": ["error-guessing"],
  boundary: ["boundary-value-analysis", "equivalence-partitioning"],
  permission: ["decision-table", "error-guessing"],
  "state-transition": ["state-transition"],
  "mock-fixture": ["cause-effect-graph", "sampling"],
};

export function generateExplorationThemes(
  riskScores: readonly RiskScore[],
  frameworkSelections: readonly FrameworkSelection[],
  coverageGaps: readonly CoverageGapEntry[],
  intentContext?: IntentContext,
): readonly ExplorationTheme[] {
  if (frameworkSelections.length === 0) {
    return [];
  }

  const riskByFile = new Map<string, number>();
  for (const score of riskScores) {
    riskByFile.set(score.changedFilePath, score.overallRisk);
  }

  const enrichment = buildIntentEnrichment(intentContext);
  const themes: ExplorationTheme[] = [];

  // One theme per framework selection
  for (const selection of frameworkSelections) {
    const maxRisk = deriveMaxRisk(selection.relevantFiles, riskByFile);
    const riskLevel = riskToLevel(maxRisk);
    const label = FRAMEWORK_LABELS[selection.framework];
    const fileNames = selection.relevantFiles
      .map((f) => f.split("/").pop() ?? f)
      .join(", ");

    themes.push({
      title: `${label}: ${fileNames}`,
      description: enrichDescription(selection.reason, enrichment),
      frameworks: [selection.framework],
      targetFiles: [...selection.relevantFiles],
      riskLevel,
      estimatedMinutes: TIMEBOX_BY_PRIORITY[riskLevel],
    });
  }

  themes.push(
    ...generateGapFocusedThemes(coverageGaps, frameworkSelections, riskByFile),
  );

  themes.sort(
    (a, b) =>
      EXPLORATION_PRIORITY_ORDER[b.riskLevel] -
        EXPLORATION_PRIORITY_ORDER[a.riskLevel] ||
      b.estimatedMinutes - a.estimatedMinutes ||
      a.title.localeCompare(b.title),
  );

  return deduplicateThemes(themes);
}

function deriveMaxRisk(
  files: readonly string[],
  riskByFile: ReadonlyMap<string, number>,
): number {
  let max = 0;
  for (const file of files) {
    const risk = riskByFile.get(file) ?? 0;
    if (risk > max) {
      max = risk;
    }
  }
  return max;
}

function riskToLevel(risk: number): ExplorationPriority {
  if (risk >= HIGH_RISK_THRESHOLD) {
    return "high";
  }
  if (risk >= 0.35) {
    return "medium";
  }
  return "low";
}

function generateGapFocusedThemes(
  coverageGaps: readonly CoverageGapEntry[],
  frameworkSelections: readonly FrameworkSelection[],
  riskByFile: ReadonlyMap<string, number>,
): ExplorationTheme[] {
  const grouped = new Map<CoverageAspect, CoverageGapEntry[]>();

  for (const gap of coverageGaps) {
    if (
      gap.status === "covered" ||
      EXPLORATION_PRIORITY_ORDER[gap.explorationPriority] <
        EXPLORATION_PRIORITY_ORDER.medium
    ) {
      continue;
    }

    const group = grouped.get(gap.aspect) ?? [];
    group.push(gap);
    grouped.set(gap.aspect, group);
  }

  return [...grouped.entries()].map(([aspect, gaps]) => {
    const targetFiles = [...new Set(gaps.map((gap) => gap.changedFilePath))];
    const filesSummary = targetFiles
      .slice(0, 2)
      .map((file) => file.split("/").pop() ?? file)
      .join(", ");
    const titleSuffix =
      targetFiles.length > 2
        ? `${filesSummary} +${targetFiles.length - 2}`
        : filesSummary;
    const uncoveredCount = gaps.filter(
      (gap) => gap.status === "uncovered",
    ).length;
    const partialCount = gaps.length - uncoveredCount;
    const frameworks = pickAspectFrameworks(
      aspect,
      targetFiles,
      frameworkSelections,
    );
    const riskLevel = riskToLevel(deriveMaxRisk(targetFiles, riskByFile));
    const detailParts: string[] = [];

    if (uncoveredCount > 0) {
      detailParts.push(`${uncoveredCount} uncovered`);
    }
    if (partialCount > 0) {
      detailParts.push(`${partialCount} partial`);
    }

    return {
      title: `Explore ${ASPECT_LABELS[aspect]}${titleSuffix ? `: ${titleSuffix}` : ""}`,
      description: `Focus on ${ASPECT_LABELS[aspect]} across ${targetFiles.length} file(s); ${detailParts.join(", ")} gap(s) remain after automated test mapping.`,
      frameworks,
      targetFiles,
      riskLevel,
      estimatedMinutes: Math.max(
        TIMEBOX_BY_PRIORITY[riskLevel],
        10 + targetFiles.length * 5,
      ),
    };
  });
}

function pickAspectFrameworks(
  aspect: CoverageAspect,
  targetFiles: readonly string[],
  frameworkSelections: readonly FrameworkSelection[],
): ExplorationFramework[] {
  const selected = frameworkSelections
    .filter((selection) =>
      selection.relevantFiles.some((file) => targetFiles.includes(file)),
    )
    .map((selection) => selection.framework);

  if (selected.length > 0) {
    return [...new Set(selected)];
  }

  return [...ASPECT_FRAMEWORK_FALLBACKS[aspect]];
}

function deduplicateThemes(
  themes: readonly ExplorationTheme[],
): ExplorationTheme[] {
  const deduplicated = new Map<string, ExplorationTheme>();

  for (const theme of themes) {
    const key = `${theme.title}::${theme.targetFiles.join(",")}::${theme.frameworks.join(",")}`;
    if (!deduplicated.has(key)) {
      deduplicated.set(key, theme);
    }
  }

  return [...deduplicated.values()];
}

// ---------------------------------------------------------------------------
// Intent context enrichment
// ---------------------------------------------------------------------------

type IntentEnrichment = {
  readonly purposeAnnotation: string | null;
  readonly userStoryNote: string | null;
  readonly criteriaNote: string | null;
};

const PURPOSE_ANNOTATIONS: Partial<
  Record<NonNullable<IntentContext["changePurpose"]>, string>
> = {
  bugfix: "This is a bugfix — pay attention to regression and error paths",
  feature: "New feature — verify complete user flow",
  refactor: "Refactor — verify behavior preservation",
};

function buildIntentEnrichment(
  intentContext?: IntentContext,
): IntentEnrichment | null {
  if (!intentContext || intentContext.extractionStatus === "empty") {
    return null;
  }

  const purposeAnnotation = intentContext.changePurpose
    ? (PURPOSE_ANNOTATIONS[intentContext.changePurpose] ?? null)
    : null;

  const userStoryNote = intentContext.userStory
    ? `PR context: ${intentContext.userStory.replace(/\n+/g, " ").trim()}`
    : null;

  const criteriaNote =
    intentContext.acceptanceCriteria.length > 0
      ? `Acceptance criteria: ${intentContext.acceptanceCriteria.join("; ")}`
      : null;

  return { purposeAnnotation, userStoryNote, criteriaNote };
}

function enrichDescription(
  baseDescription: string,
  enrichment: IntentEnrichment | null,
): string {
  if (!enrichment) {
    return baseDescription;
  }

  const parts = [trimTrailingPeriods(baseDescription)];

  if (enrichment.purposeAnnotation) {
    parts.push(trimTrailingPeriods(enrichment.purposeAnnotation));
  }
  if (enrichment.userStoryNote) {
    parts.push(trimTrailingPeriods(enrichment.userStoryNote));
  }
  if (enrichment.criteriaNote) {
    parts.push(trimTrailingPeriods(enrichment.criteriaNote));
  }

  return parts.filter((p) => p.length > 0).join(". ");
}

function trimTrailingPeriods(text: string): string {
  return text.replace(/\.+$/, "");
}
