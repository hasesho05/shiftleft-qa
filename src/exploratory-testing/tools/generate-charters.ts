import { generateSessionCharters } from "../analysis/generate-session-charters";
import {
  type PersistedAllocationItem,
  type PersistedRiskAssessment,
  type PersistedSessionCharters,
  findChangeAnalysis,
  findPrIntake,
  findRiskAssessment,
  findTestMapping,
  listAllocationItemsByDestination,
  saveSessionCharters,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import type { ResolvedPluginConfig } from "../models/config";
import type { ExplorationTheme } from "../models/risk-assessment";
import type {
  SessionCharter,
  SessionCharterGenerationResult,
} from "../models/session-charter";
import type { CoverageGapEntry } from "../models/test-mapping";
import { readPluginConfig } from "./config";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

export type GenerateChartersInput = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type GenerateChartersResult = {
  readonly persisted: PersistedSessionCharters;
  readonly handover: StepHandoverWriteResult;
};

export async function runGenerateCharters(
  input: GenerateChartersInput,
): Promise<GenerateChartersResult> {
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

  const riskAssessment = findRiskAssessment(
    config.paths.database,
    testMapping.id,
  );

  if (!riskAssessment) {
    throw new Error(
      `Risk assessment not found for test_mapping_id=${testMapping.id}. Run assess-gaps first.`,
    );
  }

  const manualItems = listAllocationItemsByDestination(
    config.paths.database,
    riskAssessment.id,
    "manual-exploration",
  );

  return runGenerateChartersFromAllocation(
    riskAssessment,
    manualItems,
    testMapping.coverageGapMap,
    config,
  );
}

export async function runGenerateChartersFromAllocation(
  riskAssessment: PersistedRiskAssessment,
  manualItems: readonly PersistedAllocationItem[],
  coverageGapMap: readonly CoverageGapEntry[],
  config: ResolvedPluginConfig,
): Promise<GenerateChartersResult> {
  const filteredThemes = filterThemesByAllocation(
    riskAssessment.explorationThemes,
    manualItems,
  );
  const charters = generateSessionCharters(filteredThemes, coverageGapMap);

  const generationResult: SessionCharterGenerationResult = {
    riskAssessmentId: riskAssessment.id,
    charters: [...charters],
    generatedAt: new Date().toISOString(),
  };

  const persisted = saveSessionCharters(
    config.paths.database,
    generationResult,
  );

  const body = buildHandoverBody(persisted);

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "generate-charters",
    status: "completed",
    summary: buildHandoverSummary(charters, manualItems.length),
    body,
  });

  return { persisted, handover };
}

export function filterThemesByAllocation(
  themes: readonly ExplorationTheme[],
  manualItems: readonly PersistedAllocationItem[],
): readonly ExplorationTheme[] {
  if (manualItems.length === 0) {
    return [];
  }

  const manualFilePaths = new Set(
    manualItems.flatMap((item) => item.changedFilePaths),
  );

  return themes.filter((theme) =>
    theme.targetFiles.some((file) => manualFilePaths.has(file)),
  );
}

function buildHandoverSummary(
  charters: readonly SessionCharter[],
  manualItemCount: number,
): string {
  const distinctFrameworks = [
    ...new Set(charters.flatMap((c) => c.selectedFrameworks)),
  ];
  const totalMinutes = charters.reduce((sum, c) => sum + c.timeboxMinutes, 0);
  return `Generated ${charters.length} charters from ${manualItemCount} manual-exploration items; frameworks: ${distinctFrameworks.join(", ")}; total timebox: ${totalMinutes}min`;
}

function buildHandoverBody(charters: PersistedSessionCharters): string {
  const lines = [
    `# Session Charters (risk_assessment_id: ${charters.riskAssessmentId})`,
    "",
    `Generated ${charters.charters.length} charter(s).`,
    "",
  ];

  // Summary table
  lines.push(
    "## Charter Summary",
    "",
    "| # | Title | Frameworks | Timebox | Scope |",
    "| --- | --- | --- | --- | --- |",
  );

  for (const [index, charter] of charters.charters.entries()) {
    const frameworks = charter.selectedFrameworks.map(escapePipe).join(", ");
    const scopeSummary =
      charter.scope.length > 2
        ? `${charter.scope.slice(0, 2).map(escapePipe).join(", ")} +${charter.scope.length - 2}`
        : charter.scope.map(escapePipe).join(", ");

    lines.push(
      `| ${index + 1} | ${escapePipe(charter.title)} | ${frameworks} | ${charter.timeboxMinutes}min | ${scopeSummary} |`,
    );
  }
  lines.push("");

  // Detailed charters
  lines.push("## Charter Details", "");

  for (const [index, charter] of charters.charters.entries()) {
    lines.push(
      `### ${index + 1}. ${charter.title}`,
      "",
      `**Goal**: ${charter.goal}`,
      "",
      `**Scope**: ${charter.scope.join(", ")}`,
      "",
      `**Frameworks**: ${charter.selectedFrameworks.join(", ")}`,
      "",
      `**Timebox**: ${charter.timeboxMinutes} minutes`,
      "",
    );

    if (charter.preconditions.length > 0) {
      lines.push("**Preconditions**:", "");
      for (const pre of charter.preconditions) {
        lines.push(`- ${pre}`);
      }
      lines.push("");
    }

    lines.push("**Observation Targets**:", "");
    for (const target of charter.observationTargets) {
      lines.push(`- **${target.category}**: ${target.description}`);
    }
    lines.push("");

    lines.push("**Stop Conditions**:", "");
    for (const condition of charter.stopConditions) {
      lines.push(`- ${condition}`);
    }
    lines.push("");
  }

  lines.push("## Next step", "", "- run-session", "");

  return lines.join("\n");
}
