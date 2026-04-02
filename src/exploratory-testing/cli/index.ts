import { readFile } from "node:fs/promises";

import { cac } from "cac";

import {
  findingSeveritySchema,
  findingTypeSchema,
  recommendedTestLayerSchema,
} from "../models/finding";
import { progressStatusSchema } from "../models/progress";
import { observationOutcomeSchema } from "../models/session";
import { runAssessGaps } from "../tools/assess-gaps";
import { readPluginConfig } from "../tools/config";
import { runDiscoverContext } from "../tools/discover-context";
import { createEnvironmentReport, getToolStatus } from "../tools/doctor";
import { runGenerateCharters } from "../tools/generate-charters";
import { readPluginManifest } from "../tools/manifest";
import { runMapTests } from "../tools/map-tests";
import { runPrIntake } from "../tools/pr-intake";
import { writeProgressSummary, writeStepHandover } from "../tools/progress";
import {
  addSessionObservation,
  completeSession,
  interruptSession,
  startSession,
} from "../tools/run-session";
import {
  initializeDatabaseFromConfig,
  initializeWorkspace,
} from "../tools/setup";
import {
  addFinding,
  generateAutomationReport,
  generateTriageReport,
  writeTriageHandover,
} from "../tools/triage-findings";

type WorkspaceCommandOptions = {
  readonly config?: string;
  readonly manifest?: string;
};

type PrIntakeCommandOptions = WorkspaceCommandOptions & {
  readonly pr?: number;
};

type PrPipelineCommandOptions = WorkspaceCommandOptions & {
  readonly pr?: number;
  readonly provider?: string;
  readonly repository?: string;
};

type SessionStartCommandOptions = WorkspaceCommandOptions & {
  readonly sessionChartersId?: number;
  readonly charterIndex?: number;
};

type SessionObserveCommandOptions = WorkspaceCommandOptions & {
  readonly session?: number;
  readonly heuristic?: string;
  readonly action?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly outcome?: string;
  readonly note?: string;
  readonly evidencePath?: string;
};

type SessionTransitionCommandOptions = WorkspaceCommandOptions & {
  readonly session?: number;
  readonly reason?: string;
};

type FindingAddCommandOptions = WorkspaceCommandOptions & {
  readonly session?: number;
  readonly observation?: number;
  readonly type?: string;
  readonly title?: string;
  readonly description?: string;
  readonly severity?: string;
  readonly testLayer?: string;
  readonly rationale?: string;
};

type FindingReportCommandOptions = WorkspaceCommandOptions & {
  readonly session?: number;
};

type HandoverCommandOptions = WorkspaceCommandOptions & {
  readonly step?: string;
  readonly status?: string;
  readonly summary?: string;
  readonly nextStep?: string;
  readonly body?: string;
  readonly bodyFile?: string;
};

const cli = cac("exploratory-testing");

cli.command("doctor", "Check the local development environment").action(() => {
  const report = createEnvironmentReport();

  if (report.runtime.bunVersion) {
    console.log(`bun ${report.runtime.bunVersion}`);
  }
  if (report.runtime.nodeVersion) {
    console.log(`node ${report.runtime.nodeVersion}`);
  }

  let hasMissingRequiredTool = false;

  for (const tool of report.tools) {
    const status = getToolStatus(tool);
    const requirement = tool.required ? "required" : "optional";
    const suffix = tool.version ? ` (${tool.version})` : "";
    console.log(`${status} ${tool.name} [${requirement}]${suffix}`);

    if (tool.required && status === "missing") {
      hasMissingRequiredTool = true;
    }
  }

  if (hasMissingRequiredTool) {
    process.exitCode = 1;
  }
});

cli
  .command("manifest", "Read and validate the plugin manifest")
  .option("--path <manifestPath>", "Path to plugin.json")
  .action(async (options) => {
    const manifest = await readPluginManifest(options.path);
    console.log(JSON.stringify(manifest, null, 2));
  });

cli
  .command("setup", "Initialize config, database, and progress artifacts")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .action(async (options: WorkspaceCommandOptions) => {
    const result = await initializeWorkspace(options.config, options.manifest);

    emitJson({
      createdConfig: result.createdConfig,
      configPath: result.config.configPath,
      databasePath: result.databasePath,
      progressDirectory: result.progressDirectory,
      progressSummaryPath: result.progressSummaryPath,
      artifactsDirectory: result.artifactsDirectory,
      setupProgressPath: result.setupProgressPath,
      currentStep: result.currentStep,
      journalMode: result.journalMode,
      foreignKeys: result.foreignKeys,
    });
  });

cli
  .command("db init", "Initialize the SQLite workspace database")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .action(async (options: WorkspaceCommandOptions) => {
    const result = await initializeDatabaseFromConfig(
      options.config,
      options.manifest,
    );

    emitJson({
      createdConfig: result.createdConfig,
      configPath: result.config.configPath,
      databasePath: result.databasePath,
      journalMode: result.journalMode,
      foreignKeys: result.foreignKeys,
    });
  });

cli
  .command("pr-intake", "Ingest PR/MR metadata and changed files")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--pr <prNumber>", "PR or MR number")
  .action(async (options: PrIntakeCommandOptions) => {
    if (!options.pr) {
      throw new Error("The --pr option is required.");
    }

    const result = await runPrIntake({
      prNumber: options.pr,
      configPath: options.config,
      manifestPath: options.manifest,
    });

    emitJson({
      provider: result.persisted.provider,
      repository: result.persisted.repository,
      prNumber: result.persisted.prNumber,
      title: result.persisted.title,
      author: result.persisted.author,
      headSha: result.persisted.headSha,
      changedFiles: result.persisted.changedFiles.length,
      reviewComments: result.persisted.reviewComments.length,
      handoverPath: result.handover.filePath,
      status: result.handover.snapshot.status,
    });
  });

cli
  .command(
    "discover-context",
    "Analyze diff and context from an ingested PR/MR",
  )
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--pr <prNumber>", "PR or MR number")
  .option("--provider <provider>", "SCM provider (github or gitlab)")
  .option("--repository <repository>", "Repository in owner/repo format")
  .action(async (options: PrPipelineCommandOptions) => {
    if (!options.pr) {
      throw new Error("The --pr option is required.");
    }
    if (!options.provider) {
      throw new Error("The --provider option is required.");
    }
    if (!options.repository) {
      throw new Error("The --repository option is required.");
    }

    const result = await runDiscoverContext({
      prNumber: options.pr,
      provider: options.provider,
      repository: options.repository,
      configPath: options.config,
      manifestPath: options.manifest,
    });

    emitJson({
      prIntakeId: result.persisted.prIntakeId,
      filesAnalyzed: result.persisted.fileAnalyses.length,
      categoriesFound: [
        ...new Set(
          result.persisted.fileAnalyses.flatMap((f) =>
            f.categories.map((c) => c.category),
          ),
        ),
      ],
      relatedCodes: result.persisted.relatedCodes.length,
      viewpointSeeds: result.persisted.viewpointSeeds.filter(
        (v) => v.seeds.length > 0,
      ).length,
      summary: result.persisted.summary,
      handoverPath: result.handover.filePath,
      status: result.handover.snapshot.status,
    });
  });

cli
  .command("map-tests", "Map related test files and build coverage gap map")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--pr <prNumber>", "PR or MR number")
  .option("--provider <provider>", "SCM provider (github or gitlab)")
  .option("--repository <repository>", "Repository in owner/repo format")
  .action(async (options: PrPipelineCommandOptions) => {
    if (!options.pr) {
      throw new Error("The --pr option is required.");
    }
    if (!options.provider) {
      throw new Error("The --provider option is required.");
    }
    if (!options.repository) {
      throw new Error("The --repository option is required.");
    }

    const result = await runMapTests({
      prNumber: options.pr,
      provider: options.provider,
      repository: options.repository,
      configPath: options.config,
      manifestPath: options.manifest,
    });

    emitJson({
      prIntakeId: result.persisted.prIntakeId,
      changeAnalysisId: result.persisted.changeAnalysisId,
      testAssets: result.persisted.testAssets.length,
      testSummaries: result.persisted.testSummaries.length,
      coverageGapEntries: result.persisted.coverageGapMap.length,
      missingLayers: result.persisted.missingLayers,
      handoverPath: result.handover.filePath,
      status: result.handover.snapshot.status,
    });
  });

cli
  .command(
    "assess-gaps",
    "Score risk, select frameworks, and generate exploration themes",
  )
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--pr <prNumber>", "PR or MR number")
  .option("--provider <provider>", "SCM provider (github or gitlab)")
  .option("--repository <repository>", "Repository in owner/repo format")
  .action(async (options: PrPipelineCommandOptions) => {
    if (!options.pr) {
      throw new Error("The --pr option is required.");
    }
    if (!options.provider) {
      throw new Error("The --provider option is required.");
    }
    if (!options.repository) {
      throw new Error("The --repository option is required.");
    }

    const result = await runAssessGaps({
      prNumber: options.pr,
      provider: options.provider,
      repository: options.repository,
      configPath: options.config,
      manifestPath: options.manifest,
    });

    emitJson({
      testMappingId: result.persisted.testMappingId,
      riskScores: result.persisted.riskScores.length,
      frameworkSelections: result.persisted.frameworkSelections.length,
      explorationThemes: result.persisted.explorationThemes.length,
      handoverPath: result.handover.filePath,
      status: result.handover.snapshot.status,
    });
  });

cli
  .command(
    "generate-charters",
    "Generate executable session charters from exploration themes",
  )
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--pr <prNumber>", "PR or MR number")
  .option("--provider <provider>", "SCM provider (github or gitlab)")
  .option("--repository <repository>", "Repository in owner/repo format")
  .action(async (options: PrPipelineCommandOptions) => {
    if (!options.pr) {
      throw new Error("The --pr option is required.");
    }
    if (!options.provider) {
      throw new Error("The --provider option is required.");
    }
    if (!options.repository) {
      throw new Error("The --repository option is required.");
    }

    const result = await runGenerateCharters({
      prNumber: options.pr,
      provider: options.provider,
      repository: options.repository,
      configPath: options.config,
      manifestPath: options.manifest,
    });

    emitJson({
      riskAssessmentId: result.persisted.riskAssessmentId,
      chartersGenerated: result.persisted.charters.length,
      handoverPath: result.handover.filePath,
      status: result.handover.snapshot.status,
    });
  });

cli
  .command("session start", "Start an exploratory session from a charter")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option(
    "--session-charters-id <sessionChartersId>",
    "Session charters record ID",
  )
  .option("--charter-index <charterIndex>", "Charter index (0-based)")
  .action(async (options: SessionStartCommandOptions) => {
    if (options.sessionChartersId === undefined) {
      throw new Error("The --session-charters-id option is required.");
    }
    if (options.charterIndex === undefined) {
      throw new Error("The --charter-index option is required.");
    }

    const config = await readPluginConfig(options.config, options.manifest);

    const result = await startSession({
      sessionChartersId: options.sessionChartersId,
      charterIndex: options.charterIndex,
      config,
    });

    emitJson({
      sessionId: result.session.id,
      charterTitle: result.session.charterTitle,
      status: result.session.status,
      startedAt: result.session.startedAt,
    });
  });

cli
  .command("session observe", "Add an observation to a running session")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--session <sessionId>", "Session ID")
  .option("--heuristic <heuristic>", "Targeted heuristic")
  .option("--action <action>", "Action performed")
  .option("--expected <expected>", "Expected result")
  .option("--actual <actual>", "Actual result")
  .option("--outcome <outcome>", "pass | fail | unclear | suspicious")
  .option("--note <note>", "Optional note")
  .option("--evidence-path <evidencePath>", "Path to evidence file")
  .action(async (options: SessionObserveCommandOptions) => {
    if (!options.session) {
      throw new Error("The --session option is required.");
    }
    if (
      !options.heuristic ||
      !options.action ||
      !options.expected ||
      !options.actual ||
      !options.outcome
    ) {
      throw new Error(
        "The --heuristic, --action, --expected, --actual, and --outcome options are required.",
      );
    }

    const config = await readPluginConfig(options.config, options.manifest);
    const outcome = observationOutcomeSchema.parse(options.outcome);

    const result = await addSessionObservation({
      sessionId: options.session,
      targetedHeuristic: options.heuristic,
      action: options.action,
      expected: options.expected,
      actual: options.actual,
      outcome,
      note: options.note ?? "",
      evidencePath: options.evidencePath ?? null,
      config,
    });

    emitJson({
      observationId: result.observation.id,
      sessionId: result.observation.sessionId,
      observationOrder: result.observation.observationOrder,
      outcome: result.observation.outcome,
    });
  });

cli
  .command("session interrupt", "Interrupt a running session")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--session <sessionId>", "Session ID")
  .option("--reason <reason>", "Reason for interruption")
  .action(async (options: SessionTransitionCommandOptions) => {
    if (!options.session) {
      throw new Error("The --session option is required.");
    }
    if (!options.reason) {
      throw new Error("The --reason option is required.");
    }

    const config = await readPluginConfig(options.config, options.manifest);

    const result = await interruptSession({
      sessionId: options.session,
      reason: options.reason,
      config,
    });

    emitJson({
      sessionId: result.session.id,
      status: result.session.status,
      interruptReason: result.session.interruptReason,
      handoverPath: result.handover.filePath,
    });
  });

cli
  .command("session complete", "Complete a running session")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--session <sessionId>", "Session ID")
  .action(async (options: SessionTransitionCommandOptions) => {
    if (!options.session) {
      throw new Error("The --session option is required.");
    }

    const config = await readPluginConfig(options.config, options.manifest);

    const result = await completeSession({
      sessionId: options.session,
      config,
    });

    emitJson({
      sessionId: result.session.id,
      status: result.session.status,
      completedAt: result.session.completedAt,
      handoverPath: result.handover.filePath,
    });
  });

// ---------------------------------------------------------------------------
// finding commands
// ---------------------------------------------------------------------------

cli
  .command(
    "finding add",
    "Add a finding from an observation (defect, spec-gap, automation-candidate)",
  )
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--session <sessionId>", "Session ID")
  .option("--observation <observationId>", "Observation ID")
  .option("--type <findingType>", "defect | spec-gap | automation-candidate")
  .option("--title <title>", "Finding title")
  .option("--description <description>", "Finding description")
  .option("--severity <severity>", "low | medium | high | critical")
  .option("--test-layer <testLayer>", "unit | integration | e2e | visual | api")
  .option("--rationale <rationale>", "Automation rationale")
  .action(async (options: FindingAddCommandOptions) => {
    if (
      !options.session ||
      !options.observation ||
      !options.type ||
      !options.title ||
      !options.description ||
      !options.severity
    ) {
      throw new Error(
        "The --session, --observation, --type, --title, --description, and --severity options are required.",
      );
    }

    const config = await readPluginConfig(options.config, options.manifest);

    const result = await addFinding({
      sessionId: options.session,
      observationId: options.observation,
      type: findingTypeSchema.parse(options.type),
      title: options.title,
      description: options.description,
      severity: findingSeveritySchema.parse(options.severity),
      recommendedTestLayer: options.testLayer
        ? recommendedTestLayerSchema.parse(options.testLayer)
        : null,
      automationRationale: options.rationale ?? null,
      config,
    });

    emitJson({
      findingId: result.finding.id,
      sessionId: result.finding.sessionId,
      observationId: result.finding.observationId,
      type: result.finding.type,
      severity: result.finding.severity,
      recommendedTestLayer: result.finding.recommendedTestLayer,
    });
  });

cli
  .command("finding report", "Generate a triage findings report")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--session <sessionId>", "Session ID")
  .action(async (options: FindingReportCommandOptions) => {
    if (!options.session) {
      throw new Error("The --session option is required.");
    }

    const config = await readPluginConfig(options.config, options.manifest);

    const report = await generateTriageReport({
      sessionId: options.session,
      config,
    });

    emitJson({
      sessionId: report.sessionId,
      totalFindings: report.totalFindings,
      countByType: report.countByType,
      countBySeverity: report.countBySeverity,
      findings: report.findings.map((f) => ({
        id: f.id,
        type: f.type,
        title: f.title,
        severity: f.severity,
        recommendedTestLayer: f.recommendedTestLayer,
      })),
    });
  });

cli
  .command(
    "finding automation-report",
    "Generate an automation candidate report",
  )
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--session <sessionId>", "Session ID")
  .action(async (options: FindingReportCommandOptions) => {
    if (!options.session) {
      throw new Error("The --session option is required.");
    }

    const config = await readPluginConfig(options.config, options.manifest);

    const report = await generateAutomationReport({
      sessionId: options.session,
      config,
    });

    emitJson({
      sessionId: report.sessionId,
      totalCandidates: report.totalCandidates,
      countByLayer: report.countByLayer,
      candidates: report.candidates.map((c) => ({
        id: c.id,
        title: c.title,
        severity: c.severity,
        recommendedTestLayer: c.recommendedTestLayer,
        automationRationale: c.automationRationale,
      })),
    });
  });

cli
  .command("finding handover", "Write triage-findings handover document")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--session <sessionId>", "Session ID")
  .action(async (options: FindingReportCommandOptions) => {
    if (!options.session) {
      throw new Error("The --session option is required.");
    }

    const config = await readPluginConfig(options.config, options.manifest);

    const result = await writeTriageHandover({
      sessionId: options.session,
      config,
    });

    emitJson({
      sessionId: result.triageReport.sessionId,
      totalFindings: result.triageReport.totalFindings,
      totalAutomationCandidates: result.automationReport.totalCandidates,
      handoverPath: result.handover.filePath,
    });
  });

cli
  .command("progress summary", "Regenerate progress-summary.md from the DB")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .action(async (options: WorkspaceCommandOptions) => {
    const result = await writeProgressSummary(options.config, options.manifest);

    emitJson({
      filePath: result.filePath,
      currentStep: result.currentStep,
      steps: result.snapshots.length,
      completedSteps: result.snapshots.filter(
        (snapshot) =>
          snapshot.status === "completed" || snapshot.status === "skipped",
      ).length,
    });
  });

cli
  .command("progress handover", "Write a step handover document and sync it")
  .option("--config <configPath>", "Path to config.json")
  .option("--manifest <manifestPath>", "Path to plugin.json")
  .option("--step <stepName>", "Workflow step name")
  .option(
    "--status <status>",
    "pending | in_progress | completed | interrupted | failed | skipped",
  )
  .option("--summary <summary>", "Short summary for the handover")
  .option("--next-step <nextStep>", "Next workflow step name")
  .option("--body <body>", "Inline markdown body for the handover document")
  .option("--body-file <bodyFile>", "Path to a markdown body file")
  .action(async (options: HandoverCommandOptions) => {
    if (!options.step || !options.status || !options.summary) {
      throw new Error(
        "The --step, --status, and --summary options are required.",
      );
    }

    const body = await readBodyOption(options.body, options.bodyFile);
    const status = progressStatusSchema.parse(options.status);
    const result = await writeStepHandover(
      {
        stepName: options.step,
        status,
        summary: options.summary,
        nextStep: options.nextStep,
        body,
      },
      options.config,
      options.manifest,
    );

    emitJson({
      filePath: result.filePath,
      step: result.snapshot.stepName,
      status: result.snapshot.status,
      nextStep: result.snapshot.nextStep,
      updatedAt: result.snapshot.updatedAt,
    });
  });

cli.help();
cli.parse();

function emitJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

async function readBodyOption(
  inlineBody: string | undefined,
  bodyFile: string | undefined,
): Promise<string | null> {
  if (inlineBody && bodyFile) {
    throw new Error("Use either --body or --body-file, but not both.");
  }

  if (bodyFile) {
    return readFile(bodyFile, "utf8");
  }

  return inlineBody ?? null;
}
