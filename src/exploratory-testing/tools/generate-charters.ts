import { generateSessionCharters } from "../analysis/generate-session-charters";
import {
  type PruningInput,
  pruneManualExplorationItems,
} from "../analysis/prune-manual-exploration";
import {
  type PersistedAllocationItem,
  type PersistedRiskAssessment,
  type PersistedSessionCharters,
  findChangeAnalysis,
  findPrIntake,
  findRiskAssessment,
  findTestMapping,
  listAllocationItems,
  listAllocationItemsByDestination,
  saveSessionCharters,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import type { ResolvedPluginConfig } from "../models/config";
import {
  DEFAULT_EXPLORATION_BUDGET_MINUTES,
  type DroppedItem,
  type PruningResult,
} from "../models/pruning";
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
  readonly pruning: PruningResult;
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

  const allocationItems = listAllocationItems(
    config.paths.database,
    riskAssessment.id,
  );

  if (allocationItems.length === 0) {
    throw new Error(
      `Allocation items not found for risk_assessment_id=${riskAssessment.id}. Run allocate run first.`,
    );
  }

  const manualItems = listAllocationItemsByDestination(
    config.paths.database,
    riskAssessment.id,
    "manual-exploration",
  );

  const devBoxItems = listAllocationItemsByDestination(
    config.paths.database,
    riskAssessment.id,
    "dev-box",
  );

  return runGenerateChartersFromAllocation(
    riskAssessment,
    manualItems,
    devBoxItems,
    testMapping.coverageGapMap,
    config,
  );
}

export async function runGenerateChartersFromAllocation(
  riskAssessment: PersistedRiskAssessment,
  manualItems: readonly PersistedAllocationItem[],
  devBoxItems: readonly PersistedAllocationItem[],
  coverageGapMap: readonly CoverageGapEntry[],
  config: ResolvedPluginConfig,
): Promise<GenerateChartersResult> {
  const pruningInput: PruningInput = {
    manualItems,
    devBoxItems,
    themes: riskAssessment.explorationThemes,
    budgetMinutes: DEFAULT_EXPLORATION_BUDGET_MINUTES,
  };

  const pruning = pruneManualExplorationItems(pruningInput);

  const selectedItemSet = new Set(pruning.selectedItemIds);
  const selectedItems = manualItems.filter((item) =>
    selectedItemSet.has(item.id),
  );

  const filteredThemes = filterThemesByAllocation(
    riskAssessment.explorationThemes,
    selectedItems,
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

  const body = buildHandoverBody(persisted, pruning.droppedItems);

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "generate-charters",
    status: "completed",
    summary: buildHandoverSummary(charters, selectedItems.length, pruning),
    body,
  });

  return { persisted, pruning, handover };
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

  // `dev-box` items are intentionally excluded here because they should be
  // verified by the implementer before QA handoff, not converted into
  // exploratory charters for the later manual session phase.
  return themes.filter((theme) =>
    theme.targetFiles.some((file) => manualFilePaths.has(file)),
  );
}

function buildHandoverSummary(
  charters: readonly SessionCharter[],
  selectedCount: number,
  pruning: PruningResult,
): string {
  const distinctFrameworks = [
    ...new Set(charters.flatMap((c) => c.selectedFrameworks)),
  ];
  const totalMinutes = charters.reduce((sum, c) => sum + c.timeboxMinutes, 0);
  const droppedCount = pruning.droppedItems.length;
  const droppedSuffix =
    droppedCount > 0 ? `; pruned ${droppedCount} items` : "";
  return `Generated ${charters.length} charters from ${selectedCount} selected items (budget: ${pruning.budgetUsedMinutes}/${pruning.budgetMinutes}min); frameworks: ${distinctFrameworks.join(", ")}; total timebox: ${totalMinutes}min${droppedSuffix}`;
}

function buildHandoverBody(
  charters: PersistedSessionCharters,
  droppedItems: readonly DroppedItem[],
): string {
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

  if (droppedItems.length > 0) {
    lines.push(
      "## Deprioritized (available if time permits)",
      "",
      "| Title | Risk | Reason | Est. |",
      "| --- | --- | --- | --- |",
    );

    for (const dropped of droppedItems) {
      lines.push(
        `| ${escapePipe(dropped.title)} | ${dropped.riskLevel} | ${dropped.reason} | ${dropped.estimatedMinutes}min |`,
      );
    }
    lines.push("");
  }

  lines.push("## Next step", "", "- run-session", "");

  return lines.join("\n");
}
