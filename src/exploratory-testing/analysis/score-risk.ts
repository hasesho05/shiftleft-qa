import type {
  ChangeCategory,
  FileChangeAnalysis,
} from "../models/change-analysis";
import type { RiskFactor, RiskScore } from "../models/risk-assessment";
import type { CoverageGapEntry } from "../models/test-mapping";

/**
 * Risk weight assigned to each change category.
 * Higher-weight categories represent areas where bugs tend to be
 * more severe or harder to catch automatically.
 */
const CATEGORY_RISK_WEIGHT: Record<ChangeCategory, number> = {
  permission: 0.9,
  "cross-service": 0.85,
  async: 0.8,
  "state-transition": 0.75,
  schema: 0.7,
  validation: 0.65,
  api: 0.6,
  "feature-flag": 0.55,
  "shared-component": 0.5,
  ui: 0.3,
};

const FACTOR_WEIGHTS = {
  uncoveredAspects: 0.4,
  changeMagnitude: 0.3,
  categoryRisk: 0.3,
} as const;

/** Threshold for "large" change — number of added+deleted lines. */
const LARGE_CHANGE_THRESHOLD = 100;

export function scoreRisks(
  fileAnalyses: readonly FileChangeAnalysis[],
  coverageGaps: readonly CoverageGapEntry[],
): readonly RiskScore[] {
  const gapsByFile = groupGapsByFile(coverageGaps);

  return fileAnalyses.map((file) => {
    const gaps = gapsByFile.get(file.path) ?? [];
    return scoreFile(file, gaps);
  });
}

function scoreFile(
  file: FileChangeAnalysis,
  gaps: readonly CoverageGapEntry[],
): RiskScore {
  const factors: RiskFactor[] = [];

  // Factor 1: uncovered aspects ratio
  const uncoveredCount = gaps.filter((g) => g.status === "uncovered").length;
  const partialCount = gaps.filter((g) => g.status === "partial").length;
  const totalGaps = gaps.length;
  const uncoveredRatio =
    totalGaps > 0 ? (uncoveredCount + partialCount * 0.5) / totalGaps : 0;
  const uncoveredContribution =
    uncoveredRatio * FACTOR_WEIGHTS.uncoveredAspects;

  factors.push({
    factor: "uncovered-aspects",
    weight: FACTOR_WEIGHTS.uncoveredAspects,
    contribution: round(uncoveredContribution),
  });

  // Factor 2: change magnitude
  const totalLines = file.additions + file.deletions;
  const magnitudeRatio = Math.min(totalLines / LARGE_CHANGE_THRESHOLD, 1);
  const magnitudeContribution = magnitudeRatio * FACTOR_WEIGHTS.changeMagnitude;

  factors.push({
    factor: "change-magnitude",
    weight: FACTOR_WEIGHTS.changeMagnitude,
    contribution: round(magnitudeContribution),
  });

  // Factor 3: category risk (max of all categories present)
  const maxCategoryWeight =
    file.categories.length > 0
      ? Math.max(
          ...file.categories.map((c) => CATEGORY_RISK_WEIGHT[c.category]),
        )
      : 0;
  const categoryContribution = maxCategoryWeight * FACTOR_WEIGHTS.categoryRisk;

  factors.push({
    factor: "category-risk",
    weight: FACTOR_WEIGHTS.categoryRisk,
    contribution: round(categoryContribution),
  });

  const rawRisk = factors.reduce((sum, f) => sum + f.contribution, 0);
  const overallRisk = clamp(round(rawRisk));

  return {
    changedFilePath: file.path,
    overallRisk,
    factors,
  };
}

function groupGapsByFile(
  gaps: readonly CoverageGapEntry[],
): Map<string, CoverageGapEntry[]> {
  const map = new Map<string, CoverageGapEntry[]>();
  for (const gap of gaps) {
    const list = map.get(gap.changedFilePath) ?? [];
    list.push(gap);
    map.set(gap.changedFilePath, list);
  }
  return map;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
