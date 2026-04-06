import { generateExplorationThemes } from "../analysis/generate-exploration-themes";
import { scoreRisks } from "../analysis/score-risk";
import { selectFrameworks } from "../analysis/select-frameworks";
import {
  type PersistedChangeAnalysis,
  type PersistedRiskAssessment,
  type PersistedTestMapping,
  findChangeAnalysis,
  findIntentContext,
  findPrIntake,
  findTestMapping,
  saveRiskAssessment,
} from "../db/workspace-repository";
import type { ResolvedPluginConfig } from "../models/config";
import type { RiskAssessmentResult } from "../models/risk-assessment";
import { readPluginConfig } from "./config";

export type AssessGapsInput = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type AssessGapsResult = {
  readonly persisted: PersistedRiskAssessment;
};

export async function runAssessGaps(
  input: AssessGapsInput,
): Promise<AssessGapsResult> {
  const configPath = input.configPath ?? "config.json";
  const manifestPath = input.manifestPath ?? ".claude-plugin/plugin.json";
  const config = await readPluginConfig(configPath, manifestPath);

  const prIntake = findPrIntake(
    config.paths.database,
    input.provider,
    input.repository,
    input.prNumber,
  );

  if (!prIntake) {
    throw new Error(
      `PR intake not found for ${input.provider}/${input.repository}#${input.prNumber}. Run pr-intake first.`,
    );
  }

  const changeAnalysis = findChangeAnalysis(config.paths.database, prIntake.id);

  if (!changeAnalysis) {
    throw new Error(
      `Change analysis not found for pr_intake_id=${prIntake.id}. Run discover-context first.`,
    );
  }

  const testMapping = findTestMapping(config.paths.database, changeAnalysis.id);

  if (!testMapping) {
    throw new Error(
      `Test mapping not found for change_analysis_id=${changeAnalysis.id}. Run map-tests first.`,
    );
  }

  return runAssessGapsFromMapping(testMapping, changeAnalysis, config);
}

export async function runAssessGapsFromMapping(
  testMapping: PersistedTestMapping,
  changeAnalysis: PersistedChangeAnalysis,
  config: ResolvedPluginConfig,
): Promise<AssessGapsResult> {
  const riskScores = scoreRisks(
    changeAnalysis.fileAnalyses,
    testMapping.coverageGapMap,
  );

  const frameworkSelections = selectFrameworks(
    changeAnalysis.fileAnalyses,
    testMapping.coverageGapMap,
  );

  const intentContext =
    findIntentContext(config.paths.database, changeAnalysis.prIntakeId) ??
    undefined;

  const explorationThemes = generateExplorationThemes(
    riskScores,
    frameworkSelections,
    testMapping.coverageGapMap,
    intentContext,
  );

  const assessmentResult: RiskAssessmentResult = {
    testMappingId: testMapping.id,
    riskScores: [...riskScores],
    frameworkSelections: [...frameworkSelections],
    explorationThemes: [...explorationThemes],
    assessedAt: new Date().toISOString(),
  };

  const persisted = saveRiskAssessment(config.paths.database, assessmentResult);

  return { persisted };
}
