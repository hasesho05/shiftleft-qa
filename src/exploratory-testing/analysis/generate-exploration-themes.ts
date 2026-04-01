import type {
  ExplorationFramework,
  ExplorationTheme,
  FrameworkSelection,
  RiskScore,
} from "../models/risk-assessment";
import {
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

export function generateExplorationThemes(
  riskScores: readonly RiskScore[],
  frameworkSelections: readonly FrameworkSelection[],
  _coverageGaps: readonly CoverageGapEntry[],
): readonly ExplorationTheme[] {
  if (frameworkSelections.length === 0) {
    return [];
  }

  const riskByFile = new Map<string, number>();
  for (const score of riskScores) {
    riskByFile.set(score.changedFilePath, score.overallRisk);
  }

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
      description: selection.reason,
      frameworks: [selection.framework],
      targetFiles: [...selection.relevantFiles],
      riskLevel,
      estimatedMinutes: TIMEBOX_BY_PRIORITY[riskLevel],
    });
  }

  // Sort by risk level descending
  themes.sort(
    (a, b) =>
      EXPLORATION_PRIORITY_ORDER[b.riskLevel] -
      EXPLORATION_PRIORITY_ORDER[a.riskLevel],
  );

  return themes;
}

function deriveMaxRisk(
  files: readonly string[],
  riskByFile: Map<string, number>,
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
