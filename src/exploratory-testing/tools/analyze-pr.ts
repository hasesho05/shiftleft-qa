import {
  type LayerApplicabilityAssessment,
  assessLayerApplicability,
} from "../analysis/assess-layer-applicability";
import type { PersistedPrIntake } from "../db/workspace-repository";
import type { FileChangeAnalysis } from "../models/change-analysis";
import type { IntentContext } from "../models/intent-context";
import type { RiskAssessmentResult } from "../models/risk-assessment";
import type { TestMappingResult } from "../models/test-mapping";
import { runAssessGapsFromMapping } from "./assess-gaps";
import { runDiscoverContextFromIntake } from "./discover-context";
import { runMapTestsFromAnalysis } from "./map-tests";
import { runPrIntake } from "./pr-intake";
import { initializeWorkspace } from "./setup";

export type AnalyzePrInput = {
  readonly prNumber: number;
  readonly repositoryRoot?: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type AnalyzePrIntentSummary = {
  readonly extractionStatus: string;
  readonly changePurpose: string | null;
  readonly userStory: string | null;
  readonly acceptanceCriteria: readonly string[];
  readonly nonGoals: readonly string[];
  readonly notesForQa: readonly string[];
};

export type AnalyzePrResult = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly title: string;
  readonly author: string;
  readonly headSha: string;
  readonly intentContext: AnalyzePrIntentSummary | null;
  readonly changedFiles: {
    readonly total: number;
    readonly categories: Record<string, number>;
  };
  readonly testCoverage: {
    readonly assets: number;
    readonly gapEntries: number;
    readonly missingLayers: readonly string[];
  };
  readonly riskHighlights: {
    readonly highRiskFiles: number;
    readonly frameworks: readonly string[];
    readonly themes: number;
  };
  readonly layerApplicability: LayerApplicabilityAssessment;
  readonly summary: string;
};

export async function runAnalyzePr(
  input: AnalyzePrInput,
): Promise<AnalyzePrResult> {
  const configPath = input.configPath ?? "config.json";
  const manifestPath = input.manifestPath ?? ".claude-plugin/plugin.json";
  const workspace = await initializeWorkspace(configPath, manifestPath, {
    repositoryRoot: input.repositoryRoot,
  });
  const config = workspace.config;

  // PR intake
  const intake = await runPrIntake({
    prNumber: input.prNumber,
    configPath,
    manifestPath,
  });

  // Discover context
  const context = await runDiscoverContextFromIntake(intake.persisted, config);

  // Map tests
  const mapping = await runMapTestsFromAnalysis(
    context.persisted,
    intake.persisted,
    config,
  );

  // Assess gaps
  const gaps = await runAssessGapsFromMapping(
    mapping.persisted,
    context.persisted,
    config,
  );

  // Build user-facing result without internal IDs
  const layerApplicability = assessLayerApplicability({
    changedFilePaths: intake.persisted.changedFiles.map((f) => f.path),
    fileAnalyses: context.persisted.fileAnalyses,
    allocationItems: [],
  });

  return {
    prNumber: intake.persisted.prNumber,
    provider: intake.persisted.provider,
    repository: intake.persisted.repository,
    title: intake.persisted.title,
    author: intake.persisted.author,
    headSha: intake.persisted.headSha,
    intentContext: buildIntentSummary(intake.intentContext),
    changedFiles: buildChangedFilesSummary(context.persisted.fileAnalyses),
    testCoverage: buildTestCoverageSummary(mapping.persisted),
    riskHighlights: buildRiskHighlights(gaps.persisted),
    layerApplicability,
    summary: buildOverallSummary(
      intake.persisted,
      context.persisted.fileAnalyses,
      mapping.persisted,
      gaps.persisted,
    ),
  };
}

function buildIntentSummary(
  intentContext: {
    readonly extractionStatus: string;
    readonly changePurpose: string | null;
    readonly userStory: string | null;
    readonly acceptanceCriteria: readonly string[];
    readonly nonGoals: readonly string[];
    readonly targetUsers: readonly string[];
    readonly notesForQa: readonly string[];
  } | null,
): AnalyzePrIntentSummary | null {
  if (!intentContext || intentContext.extractionStatus === "empty") {
    return null;
  }
  return {
    extractionStatus: intentContext.extractionStatus,
    changePurpose: intentContext.changePurpose,
    userStory: intentContext.userStory,
    acceptanceCriteria: intentContext.acceptanceCriteria,
    nonGoals: intentContext.nonGoals,
    notesForQa: intentContext.notesForQa,
  };
}

function buildChangedFilesSummary(
  fileAnalyses: readonly FileChangeAnalysis[],
): AnalyzePrResult["changedFiles"] {
  const categories: Record<string, number> = {};
  for (const fa of fileAnalyses) {
    for (const cat of fa.categories) {
      categories[cat.category] = (categories[cat.category] ?? 0) + 1;
    }
  }
  return { total: fileAnalyses.length, categories };
}

function buildTestCoverageSummary(mapping: {
  readonly testAssets: TestMappingResult["testAssets"];
  readonly coverageGapMap: TestMappingResult["coverageGapMap"];
  readonly missingLayers: TestMappingResult["missingLayers"];
}): AnalyzePrResult["testCoverage"] {
  return {
    assets: mapping.testAssets.length,
    gapEntries: mapping.coverageGapMap.length,
    missingLayers: mapping.missingLayers,
  };
}

function buildRiskHighlights(assessment: {
  readonly riskScores: RiskAssessmentResult["riskScores"];
  readonly frameworkSelections: RiskAssessmentResult["frameworkSelections"];
  readonly explorationThemes: RiskAssessmentResult["explorationThemes"];
}): AnalyzePrResult["riskHighlights"] {
  const HIGH_RISK_THRESHOLD = 0.7;
  const highRiskFiles = assessment.riskScores.filter(
    (s) => s.overallRisk >= HIGH_RISK_THRESHOLD,
  ).length;

  const frameworks = assessment.frameworkSelections.map((f) => f.framework);
  return {
    highRiskFiles,
    frameworks,
    themes: assessment.explorationThemes.length,
  };
}

function buildOverallSummary(
  prIntake: PersistedPrIntake,
  fileAnalyses: readonly FileChangeAnalysis[],
  mapping: {
    readonly testAssets: TestMappingResult["testAssets"];
    readonly coverageGapMap: TestMappingResult["coverageGapMap"];
    readonly missingLayers: TestMappingResult["missingLayers"];
  },
  assessment: {
    readonly riskScores: RiskAssessmentResult["riskScores"];
    readonly frameworkSelections: RiskAssessmentResult["frameworkSelections"];
    readonly explorationThemes: RiskAssessmentResult["explorationThemes"];
  },
): string {
  const parts = [
    `${prIntake.repository}#${prIntake.prNumber}`,
    `${fileAnalyses.length} files analyzed`,
    `${mapping.testAssets.length} test assets found`,
    `${mapping.coverageGapMap.length} coverage gap entries`,
    `${assessment.frameworkSelections.length} frameworks selected`,
    `${assessment.explorationThemes.length} exploration themes`,
  ];
  return parts.join(", ");
}
