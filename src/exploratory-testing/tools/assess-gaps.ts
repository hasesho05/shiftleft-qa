import { generateExplorationThemes } from "../analysis/generate-exploration-themes";
import { scoreRisks } from "../analysis/score-risk";
import { selectFrameworks } from "../analysis/select-frameworks";
import {
  type PersistedChangeAnalysis,
  type PersistedRiskAssessment,
  type PersistedTestMapping,
  findChangeAnalysis,
  findPrIntake,
  findTestMapping,
  saveRiskAssessment,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import type { ResolvedPluginConfig } from "../models/config";
import type { RiskAssessmentResult } from "../models/risk-assessment";
import { readPluginConfig } from "./config";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

export type AssessGapsInput = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type AssessGapsResult = {
  readonly persisted: PersistedRiskAssessment;
  readonly handover: StepHandoverWriteResult;
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

  const explorationThemes = generateExplorationThemes(
    riskScores,
    frameworkSelections,
    testMapping.coverageGapMap,
  );

  const assessmentResult: RiskAssessmentResult = {
    testMappingId: testMapping.id,
    riskScores: [...riskScores],
    frameworkSelections: [...frameworkSelections],
    explorationThemes: [...explorationThemes],
    assessedAt: new Date().toISOString(),
  };

  const persisted = saveRiskAssessment(config.paths.database, assessmentResult);
  const body = buildHandoverBody(persisted);

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "assess-gaps",
    status: "completed",
    summary: `Scored ${riskScores.length} files, selected ${frameworkSelections.length} frameworks, generated ${explorationThemes.length} themes`,
    body,
  });

  return { persisted, handover };
}

function buildHandoverBody(assessment: PersistedRiskAssessment): string {
  const lines = [
    `# Risk Assessment (test_mapping_id: ${assessment.testMappingId})`,
    "",
  ];

  // Risk Scores
  lines.push(
    "## Risk Scores",
    "",
    "| File | Overall Risk | Top Factor |",
    "| --- | --- | --- |",
  );

  const sortedScores = [...assessment.riskScores].sort(
    (a, b) => b.overallRisk - a.overallRisk,
  );

  for (const score of sortedScores) {
    const topFactor =
      score.factors.length > 0
        ? score.factors.reduce((a, b) =>
            a.contribution > b.contribution ? a : b,
          ).factor
        : "—";
    lines.push(
      `| ${escapePipe(score.changedFilePath)} | ${score.overallRisk} | ${topFactor} |`,
    );
  }
  lines.push("");

  // Framework Selections
  lines.push(
    "## Framework Selections",
    "",
    "| Framework | Priority | Reason | Files |",
    "| --- | --- | --- | --- |",
  );

  for (const selection of assessment.frameworkSelections) {
    const files = selection.relevantFiles.map(escapePipe).join(", ");
    lines.push(
      `| ${selection.framework} | ${selection.priority} | ${escapePipe(selection.reason)} | ${files} |`,
    );
  }
  lines.push("");

  // Exploration Themes
  lines.push("## Exploration Themes", "");

  for (const [index, theme] of assessment.explorationThemes.entries()) {
    lines.push(
      `### ${index + 1}. ${theme.title} [${theme.riskLevel}] (~${theme.estimatedMinutes}min)`,
      "",
      theme.description,
      "",
      `- **Frameworks**: ${theme.frameworks.join(", ")}`,
      `- **Target files**: ${theme.targetFiles.join(", ") || "—"}`,
      "",
    );
  }

  lines.push("## Next step", "", "- generate-charters", "");

  return lines.join("\n");
}
