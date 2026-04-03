import {
  type PersistedFinding,
  findObservation,
  findSession,
  listFindings,
  listFindingsByType,
  saveFinding,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import type { ResolvedPluginConfig } from "../models/config";
import type {
  FindingSeverity,
  FindingType,
  RecommendedTestLayer,
} from "../models/finding";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

// ---------------------------------------------------------------------------
// addFinding
// ---------------------------------------------------------------------------

export type AddFindingInput = {
  readonly sessionId: number;
  readonly observationId: number;
  readonly type: FindingType;
  readonly title: string;
  readonly description: string;
  readonly severity: FindingSeverity;
  readonly recommendedTestLayer: RecommendedTestLayer | null;
  readonly automationRationale: string | null;
  readonly config: ResolvedPluginConfig;
};

export type AddFindingResult = {
  readonly finding: PersistedFinding;
};

export async function addFinding(
  input: AddFindingInput,
): Promise<AddFindingResult> {
  const databasePath = input.config.paths.database;

  const session = findSession(databasePath, input.sessionId);
  if (!session) {
    throw new Error(`Session not found: id=${input.sessionId}`);
  }

  const observation = findObservation(databasePath, input.observationId);
  if (!observation) {
    throw new Error(`Observation not found: id=${input.observationId}`);
  }
  if (observation.sessionId !== input.sessionId) {
    throw new Error(
      `Observation ${input.observationId} belongs to session ${observation.sessionId}, not session ${input.sessionId}`,
    );
  }

  if (input.type === "automation-candidate") {
    if (!input.recommendedTestLayer) {
      throw new Error(
        "recommendedTestLayer is required for automation-candidate findings",
      );
    }
    if (!input.automationRationale) {
      throw new Error(
        "automationRationale is required for automation-candidate findings",
      );
    }
  }

  const finding = saveFinding(databasePath, {
    sessionId: input.sessionId,
    observationId: input.observationId,
    type: input.type,
    title: input.title,
    description: input.description,
    severity: input.severity,
    recommendedTestLayer: input.recommendedTestLayer,
    automationRationale: input.automationRationale,
  });

  return { finding };
}

// ---------------------------------------------------------------------------
// generateTriageReport
// ---------------------------------------------------------------------------

export type GenerateTriageReportInput = {
  readonly sessionId: number;
  readonly config: ResolvedPluginConfig;
};

export type TriageReport = {
  readonly sessionId: number;
  readonly totalFindings: number;
  readonly countByType: Record<FindingType, number>;
  readonly countBySeverity: Record<FindingSeverity, number>;
  readonly findings: readonly PersistedFinding[];
};

export async function generateTriageReport(
  input: GenerateTriageReportInput,
): Promise<TriageReport> {
  const databasePath = input.config.paths.database;

  const session = findSession(databasePath, input.sessionId);
  if (!session) {
    throw new Error(`Session not found: id=${input.sessionId}`);
  }

  const findings = listFindings(databasePath, input.sessionId);

  const countByType: Record<FindingType, number> = {
    defect: 0,
    "spec-gap": 0,
    "automation-candidate": 0,
  };

  const countBySeverity: Record<FindingSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const finding of findings) {
    countByType[finding.type]++;
    countBySeverity[finding.severity]++;
  }

  return {
    sessionId: input.sessionId,
    totalFindings: findings.length,
    countByType,
    countBySeverity,
    findings,
  };
}

// ---------------------------------------------------------------------------
// generateAutomationReport
// ---------------------------------------------------------------------------

export type GenerateAutomationReportInput = {
  readonly sessionId: number;
  readonly config: ResolvedPluginConfig;
};

export type AutomationReport = {
  readonly sessionId: number;
  readonly totalCandidates: number;
  readonly countByLayer: Record<RecommendedTestLayer, number>;
  readonly candidates: readonly PersistedFinding[];
};

export async function generateAutomationReport(
  input: GenerateAutomationReportInput,
): Promise<AutomationReport> {
  const databasePath = input.config.paths.database;

  const session = findSession(databasePath, input.sessionId);
  if (!session) {
    throw new Error(`Session not found: id=${input.sessionId}`);
  }

  const candidates = listFindingsByType(
    databasePath,
    input.sessionId,
    "automation-candidate",
  );

  const countByLayer: Record<RecommendedTestLayer, number> = {
    unit: 0,
    integration: 0,
    e2e: 0,
    visual: 0,
    api: 0,
  };

  for (const candidate of candidates) {
    if (candidate.recommendedTestLayer) {
      countByLayer[candidate.recommendedTestLayer]++;
    }
  }

  return {
    sessionId: input.sessionId,
    totalCandidates: candidates.length,
    countByLayer,
    candidates,
  };
}

// ---------------------------------------------------------------------------
// writeTriageHandover
// ---------------------------------------------------------------------------

export type WriteTriageHandoverInput = {
  readonly sessionId: number;
  readonly config: ResolvedPluginConfig;
};

export type WriteTriageHandoverResult = {
  readonly triageReport: TriageReport;
  readonly automationReport: AutomationReport;
  readonly handover: StepHandoverWriteResult;
};

export async function writeTriageHandover(
  input: WriteTriageHandoverInput,
): Promise<WriteTriageHandoverResult> {
  const triageReport = await generateTriageReport(input);
  const automationReport = await generateAutomationReport(input);

  const body = buildTriageHandoverBody(triageReport, automationReport);
  const summary = buildTriageHandoverSummary(triageReport, automationReport);

  const handover = await writeStepHandoverFromConfig(input.config, {
    stepName: "triage-findings",
    status: "completed",
    summary,
    body,
  });

  return { triageReport, automationReport, handover };
}

function buildTriageHandoverSummary(
  triage: TriageReport,
  automation: AutomationReport,
): string {
  const parts = [
    `${triage.totalFindings} finding(s)`,
    `${triage.countByType.defect} defect(s)`,
    `${triage.countByType["spec-gap"]} spec-gap(s)`,
    `${automation.totalCandidates} automation candidate(s)`,
  ];
  return parts.join("; ");
}

function buildTriageHandoverBody(
  triage: TriageReport,
  automation: AutomationReport,
): string {
  const lines = [
    "# Triage Findings Report",
    "",
    `**Session ID**: ${triage.sessionId}`,
    `**Total findings**: ${triage.totalFindings}`,
    "",
    "## By Type",
    "",
    `- **defect**: ${triage.countByType.defect}`,
    `- **spec-gap**: ${triage.countByType["spec-gap"]}`,
    `- **automation-candidate**: ${triage.countByType["automation-candidate"]}`,
    "",
    "## By Severity",
    "",
    `- **critical**: ${triage.countBySeverity.critical}`,
    `- **high**: ${triage.countBySeverity.high}`,
    `- **medium**: ${triage.countBySeverity.medium}`,
    `- **low**: ${triage.countBySeverity.low}`,
    "",
  ];

  if (triage.findings.length > 0) {
    lines.push(
      "## All Findings",
      "",
      "| # | Type | Title | Severity | Test Layer | Rationale |",
      "| --- | --- | --- | --- | --- | --- |",
    );

    for (const f of triage.findings) {
      const layer = f.recommendedTestLayer ?? "-";
      const rationale = f.automationRationale
        ? escapePipe(f.automationRationale)
        : "-";
      lines.push(
        `| ${f.id} | ${f.type} | ${escapePipe(f.title)} | ${f.severity} | ${layer} | ${rationale} |`,
      );
    }
    lines.push("");
  }

  if (automation.totalCandidates > 0) {
    lines.push(
      "## Automation Candidates by Layer",
      "",
      `- **unit**: ${automation.countByLayer.unit}`,
      `- **integration**: ${automation.countByLayer.integration}`,
      `- **e2e**: ${automation.countByLayer.e2e}`,
      `- **visual**: ${automation.countByLayer.visual}`,
      `- **api**: ${automation.countByLayer.api}`,
      "",
    );
  }

  lines.push("## Next step", "", "- export-artifacts", "");

  return lines.join("\n");
}
