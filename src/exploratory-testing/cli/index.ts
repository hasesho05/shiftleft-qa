import { readFile } from "node:fs/promises";

import { cac } from "cac";

import { progressStatusSchema } from "../models/progress";
import { runAssessGaps } from "../tools/assess-gaps";
import { runDiscoverContext } from "../tools/discover-context";
import { createEnvironmentReport, getToolStatus } from "../tools/doctor";
import { runGenerateCharters } from "../tools/generate-charters";
import { readPluginManifest } from "../tools/manifest";
import { runMapTests } from "../tools/map-tests";
import { runPrIntake } from "../tools/pr-intake";
import { writeProgressSummary, writeStepHandover } from "../tools/progress";
import {
  initializeDatabaseFromConfig,
  initializeWorkspace,
} from "../tools/setup";

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
