import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { cac } from "cac";

import { normalizeExecaError } from "../lib/execa-error";
import {
  findingSeveritySchema,
  findingTypeSchema,
  recommendedTestLayerSchema,
} from "../models/finding";
import { progressStatusSchema } from "../models/progress";
import { observationOutcomeSchema } from "../models/session";
import {
  listAllocation,
  runAllocate,
  summarizeAllocation,
} from "../tools/allocate";
import { runAssessGaps } from "../tools/assess-gaps";
import { readPluginConfig } from "../tools/config";
import { runDiscoverContext } from "../tools/discover-context";
import { createEnvironmentReport } from "../tools/doctor";
import { exportArtifacts } from "../tools/export-artifacts";
import { runGenerateCharters } from "../tools/generate-charters";
import {
  generateHandoffMarkdown,
  runAddHandoffComment,
  runAddHandoffCommentRaw,
  runCreateHandoffIssue,
  runCreateHandoffIssueRaw,
  runUpdateHandoffIssue,
  runUpdateHandoffIssueBody,
} from "../tools/handoff";
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

type ExportArtifactsCommandOptions = WorkspaceCommandOptions & {
  readonly prIntakeId?: number;
};

type HandoverCommandOptions = WorkspaceCommandOptions & {
  readonly step?: string;
  readonly status?: string;
  readonly summary?: string;
  readonly nextStep?: string;
  readonly body?: string;
  readonly bodyFile?: string;
};

type AllocateCommandOptions = WorkspaceCommandOptions & {
  readonly riskAssessmentId?: number;
};

type HandoffCreateCommandOptions = {
  readonly repository?: string;
  readonly title?: string;
  readonly body?: string;
  readonly bodyFile?: string;
  readonly label?: string[];
  readonly assignee?: string[];
  readonly cwd?: string;
};

type HandoffGenerateCommandOptions = WorkspaceCommandOptions & {
  readonly riskAssessmentId?: number;
};

type HandoffPublishCommandOptions = WorkspaceCommandOptions & {
  readonly riskAssessmentId?: number;
  readonly title?: string;
  readonly label?: string[];
  readonly assignee?: string[];
};

type HandoffAllocationUpdateCommandOptions = WorkspaceCommandOptions & {
  readonly riskAssessmentId?: number;
  readonly issueNumber?: number;
};

type HandoffFindingsCommandOptions = WorkspaceCommandOptions & {
  readonly issueNumber?: number;
  readonly sessionId?: number;
};

type HandoffUpdateCommandOptions = {
  readonly repository?: string;
  readonly issueNumber?: number;
  readonly body?: string;
  readonly bodyFile?: string;
  readonly cwd?: string;
};

type HandoffCommentCommandOptions = {
  readonly repository?: string;
  readonly issueNumber?: number;
  readonly body?: string;
  readonly bodyFile?: string;
  readonly cwd?: string;
};

export type JsonSuccessEnvelope<T> = {
  readonly status: "ok";
  readonly data: T;
};

export type JsonErrorEnvelope = {
  readonly status: "error";
  readonly message: string;
};

export type JsonEnvelope<T> = JsonSuccessEnvelope<T> | JsonErrorEnvelope;

export function formatSuccessEnvelope<T>(data: T): JsonSuccessEnvelope<T> {
  return {
    status: "ok",
    data,
  };
}

export function formatErrorEnvelope(error: unknown): JsonErrorEnvelope {
  return {
    status: "error",
    message: normalizeCliErrorMessage(error),
  };
}

export function normalizeCliErrorMessage(error: unknown): string {
  return normalizeExecaError(error, undefined, "不明なエラーです");
}

function emitJsonEnvelope<T>(envelope: JsonEnvelope<T>): void {
  console.log(JSON.stringify(envelope, null, 2));
}

function createEnvelopeAction<TArgs extends readonly unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs): Promise<void> => {
    try {
      emitJsonEnvelope(formatSuccessEnvelope(await handler(...args)));
    } catch (error) {
      process.exitCode = 1;
      emitJsonEnvelope(formatErrorEnvelope(error));
    }
  };
}

const cli = cac("exploratory-testing");

cli.command("doctor", "ローカル開発環境を確認する").action(
  createEnvelopeAction(() => {
    const report = createEnvironmentReport();
    const hasMissingRequiredTool = report.tools.some(
      (tool) => tool.required && !tool.detected,
    );

    return {
      ...report,
      hasMissingRequiredTool,
    };
  }),
);

cli
  .command("manifest", "plugin manifest を読み込み検証する")
  .option("--path <manifestPath>", "plugin.json のパス")
  .action(
    createEnvelopeAction(async (options) => {
      return readPluginManifest(options.path);
    }),
  );

cli
  .command("setup", "config、DB、progress を初期化する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .action(
    createEnvelopeAction(async (options: WorkspaceCommandOptions) => {
      const result = await initializeWorkspace(
        options.config,
        options.manifest,
      );

      return {
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
      };
    }),
  );

cli
  .command("db init", "SQLite ワークスペース DB を初期化する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .action(
    createEnvelopeAction(async (options: WorkspaceCommandOptions) => {
      const result = await initializeDatabaseFromConfig(
        options.config,
        options.manifest,
      );

      return {
        createdConfig: result.createdConfig,
        configPath: result.config.configPath,
        databasePath: result.databasePath,
        journalMode: result.journalMode,
        foreignKeys: result.foreignKeys,
      };
    }),
  );

cli
  .command("pr-intake", "PR/MR のメタデータと変更ファイルを取り込む")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .action(
    createEnvelopeAction(async (options: PrIntakeCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }

      const result = await runPrIntake({
        prNumber: options.pr,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
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
      };
    }),
  );

cli
  .command(
    "discover-context",
    "取り込み済みの PR/MR から diff と文脈を解析する",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .option("--provider <provider>", "SCM プロバイダ (github または gitlab)")
  .option("--repository <repository>", "リポジトリ名 (owner/repo 形式)")
  .action(
    createEnvelopeAction(async (options: PrPipelineCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }
      if (!options.provider) {
        throw new Error("--provider オプションは必須です。");
      }
      if (!options.repository) {
        throw new Error("--repository オプションは必須です。");
      }

      const result = await runDiscoverContext({
        prNumber: options.pr,
        provider: options.provider,
        repository: options.repository,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
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
      };
    }),
  );

cli
  .command("map-tests", "関連テストを対応付けて coverage gap map を作る")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .option("--provider <provider>", "SCM プロバイダ (github または gitlab)")
  .option("--repository <repository>", "リポジトリ名 (owner/repo 形式)")
  .action(
    createEnvelopeAction(async (options: PrPipelineCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }
      if (!options.provider) {
        throw new Error("--provider オプションは必須です。");
      }
      if (!options.repository) {
        throw new Error("--repository オプションは必須です。");
      }

      const result = await runMapTests({
        prNumber: options.pr,
        provider: options.provider,
        repository: options.repository,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        prIntakeId: result.persisted.prIntakeId,
        changeAnalysisId: result.persisted.changeAnalysisId,
        testAssets: result.persisted.testAssets.length,
        testSummaries: result.persisted.testSummaries.length,
        coverageGapEntries: result.persisted.coverageGapMap.length,
        missingLayers: result.persisted.missingLayers,
        handoverPath: result.handover.filePath,
        status: result.handover.snapshot.status,
      };
    }),
  );

cli
  .command(
    "assess-gaps",
    "リスク評価、フレームワーク選定、探索テーマ生成を行う",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .option("--provider <provider>", "SCM プロバイダ (github または gitlab)")
  .option("--repository <repository>", "リポジトリ名 (owner/repo 形式)")
  .action(
    createEnvelopeAction(async (options: PrPipelineCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }
      if (!options.provider) {
        throw new Error("--provider オプションは必須です。");
      }
      if (!options.repository) {
        throw new Error("--repository オプションは必須です。");
      }

      const result = await runAssessGaps({
        prNumber: options.pr,
        provider: options.provider,
        repository: options.repository,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        testMappingId: result.persisted.testMappingId,
        riskScores: result.persisted.riskScores.length,
        frameworkSelections: result.persisted.frameworkSelections.length,
        explorationThemes: result.persisted.explorationThemes.length,
        handoverPath: result.handover.filePath,
        status: result.handover.snapshot.status,
      };
    }),
  );

cli
  .command("allocate run", "allocation core を実行して結果を永続化する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option(
    "--risk-assessment-id <riskAssessmentId>",
    "risk assessment レコード ID",
  )
  .action(
    createEnvelopeAction(async (options: AllocateCommandOptions) => {
      if (options.riskAssessmentId === undefined) {
        throw new Error("--risk-assessment-id オプションは必須です。");
      }

      const result = await runAllocate({
        riskAssessmentId: options.riskAssessmentId,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        riskAssessmentId: result.riskAssessmentId,
        allocatedItems: result.items.length,
        destinationCounts: result.destinationCounts,
      };
    }),
  );

cli
  .command("allocate list", "allocation 結果を一覧表示する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option(
    "--risk-assessment-id <riskAssessmentId>",
    "risk assessment レコード ID",
  )
  .action(
    createEnvelopeAction(async (options: AllocateCommandOptions) => {
      if (options.riskAssessmentId === undefined) {
        throw new Error("--risk-assessment-id オプションは必須です。");
      }

      const result = await listAllocation({
        riskAssessmentId: options.riskAssessmentId,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        riskAssessmentId: result.riskAssessmentId,
        items: result.items,
        destinationCounts: result.destinationCounts,
      };
    }),
  );

cli
  .command("allocate summary", "allocation の destination 別サマリーを返す")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option(
    "--risk-assessment-id <riskAssessmentId>",
    "risk assessment レコード ID",
  )
  .action(
    createEnvelopeAction(async (options: AllocateCommandOptions) => {
      if (options.riskAssessmentId === undefined) {
        throw new Error("--risk-assessment-id オプションは必須です。");
      }

      const result = await summarizeAllocation({
        riskAssessmentId: options.riskAssessmentId,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return result;
    }),
  );

cli
  .command(
    "generate-charters",
    "探索テーマから実行可能な session charter を生成する",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .option("--provider <provider>", "SCM プロバイダ (github または gitlab)")
  .option("--repository <repository>", "リポジトリ名 (owner/repo 形式)")
  .action(
    createEnvelopeAction(async (options: PrPipelineCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }
      if (!options.provider) {
        throw new Error("--provider オプションは必須です。");
      }
      if (!options.repository) {
        throw new Error("--repository オプションは必須です。");
      }

      const result = await runGenerateCharters({
        prNumber: options.pr,
        provider: options.provider,
        repository: options.repository,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        riskAssessmentId: result.persisted.riskAssessmentId,
        chartersGenerated: result.persisted.charters.length,
        handoverPath: result.handover.filePath,
        status: result.handover.snapshot.status,
      };
    }),
  );

cli
  .command("session start", "charter から探索セッションを開始する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option(
    "--session-charters-id <sessionChartersId>",
    "session charters レコード ID",
  )
  .option("--charter-index <charterIndex>", "charter の index (0 始まり)")
  .action(
    createEnvelopeAction(async (options: SessionStartCommandOptions) => {
      if (options.sessionChartersId === undefined) {
        throw new Error("--session-charters-id オプションは必須です。");
      }
      if (options.charterIndex === undefined) {
        throw new Error("--charter-index オプションは必須です。");
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const result = await startSession({
        sessionChartersId: options.sessionChartersId,
        charterIndex: options.charterIndex,
        config,
      });

      return {
        sessionId: result.session.id,
        charterTitle: result.session.charterTitle,
        status: result.session.status,
        startedAt: result.session.startedAt,
      };
    }),
  );

cli
  .command("session observe", "実行中セッションに観察結果を追加する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--session <sessionId>", "セッション ID")
  .option("--heuristic <heuristic>", "対象ヒューリスティック")
  .option("--action <action>", "実施した操作")
  .option("--expected <expected>", "期待結果")
  .option("--actual <actual>", "実際の結果")
  .option("--outcome <outcome>", "pass | fail | unclear | suspicious")
  .option("--note <note>", "任意メモ")
  .option("--evidence-path <evidencePath>", "証跡ファイルのパス")
  .action(
    createEnvelopeAction(async (options: SessionObserveCommandOptions) => {
      if (!options.session) {
        throw new Error("--session オプションは必須です。");
      }
      if (
        !options.heuristic ||
        !options.action ||
        !options.expected ||
        !options.actual ||
        !options.outcome
      ) {
        throw new Error(
          "--heuristic、--action、--expected、--actual、--outcome は必須です。",
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

      return {
        observationId: result.observation.id,
        sessionId: result.observation.sessionId,
        observationOrder: result.observation.observationOrder,
        outcome: result.observation.outcome,
      };
    }),
  );

cli
  .command("session interrupt", "実行中セッションを中断する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--session <sessionId>", "セッション ID")
  .option("--reason <reason>", "中断理由")
  .action(
    createEnvelopeAction(async (options: SessionTransitionCommandOptions) => {
      if (!options.session) {
        throw new Error("--session オプションは必須です。");
      }
      if (!options.reason) {
        throw new Error("--reason オプションは必須です。");
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const result = await interruptSession({
        sessionId: options.session,
        reason: options.reason,
        config,
      });

      return {
        sessionId: result.session.id,
        status: result.session.status,
        interruptReason: result.session.interruptReason,
        handoverPath: result.handover.filePath,
      };
    }),
  );

cli
  .command("session complete", "実行中セッションを完了する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--session <sessionId>", "セッション ID")
  .action(
    createEnvelopeAction(async (options: SessionTransitionCommandOptions) => {
      if (!options.session) {
        throw new Error("--session オプションは必須です。");
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const result = await completeSession({
        sessionId: options.session,
        config,
      });

      return {
        sessionId: result.session.id,
        status: result.session.status,
        completedAt: result.session.completedAt,
        handoverPath: result.handover.filePath,
      };
    }),
  );

// ---------------------------------------------------------------------------
// finding commands
// ---------------------------------------------------------------------------

cli
  .command(
    "finding add",
    "観察結果から finding を追加する (defect, spec-gap, automation-candidate)",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--session <sessionId>", "セッション ID")
  .option("--observation <observationId>", "観察結果 ID")
  .option("--type <findingType>", "defect | spec-gap | automation-candidate")
  .option("--title <title>", "finding タイトル")
  .option("--description <description>", "finding 説明")
  .option("--severity <severity>", "low | medium | high | critical")
  .option("--test-layer <testLayer>", "unit | integration | e2e | visual | api")
  .option("--rationale <rationale>", "自動化候補の理由")
  .action(
    createEnvelopeAction(async (options: FindingAddCommandOptions) => {
      if (
        !options.session ||
        !options.observation ||
        !options.type ||
        !options.title ||
        !options.description ||
        !options.severity
      ) {
        throw new Error(
          "--session、--observation、--type、--title、--description、--severity は必須です。",
        );
      }

      const parsedType = findingTypeSchema.parse(options.type);

      if (parsedType === "automation-candidate") {
        if (!options.testLayer) {
          throw new Error(
            "automation-candidate では --test-layer が必須です。",
          );
        }
        if (!options.rationale) {
          throw new Error("automation-candidate では --rationale が必須です。");
        }
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const result = await addFinding({
        sessionId: options.session,
        observationId: options.observation,
        type: parsedType,
        title: options.title,
        description: options.description,
        severity: findingSeveritySchema.parse(options.severity),
        recommendedTestLayer: options.testLayer
          ? recommendedTestLayerSchema.parse(options.testLayer)
          : null,
        automationRationale: options.rationale ?? null,
        config,
      });

      return {
        findingId: result.finding.id,
        sessionId: result.finding.sessionId,
        observationId: result.finding.observationId,
        type: result.finding.type,
        severity: result.finding.severity,
        recommendedTestLayer: result.finding.recommendedTestLayer,
      };
    }),
  );

cli
  .command("finding report", "triage findings レポートを生成する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--session <sessionId>", "セッション ID")
  .action(
    createEnvelopeAction(async (options: FindingReportCommandOptions) => {
      if (!options.session) {
        throw new Error("--session オプションは必須です。");
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const report = await generateTriageReport({
        sessionId: options.session,
        config,
      });

      return {
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
      };
    }),
  );

cli
  .command(
    "finding automation-report",
    "automation candidate レポートを生成する",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--session <sessionId>", "セッション ID")
  .action(
    createEnvelopeAction(async (options: FindingReportCommandOptions) => {
      if (!options.session) {
        throw new Error("--session オプションは必須です。");
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const report = await generateAutomationReport({
        sessionId: options.session,
        config,
      });

      return {
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
      };
    }),
  );

cli
  .command("finding handover", "triage-findings handover 文書を書き出す")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--session <sessionId>", "セッション ID")
  .action(
    createEnvelopeAction(async (options: FindingReportCommandOptions) => {
      if (!options.session) {
        throw new Error("--session オプションは必須です。");
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const result = await writeTriageHandover({
        sessionId: options.session,
        config,
      });

      return {
        sessionId: result.triageReport.sessionId,
        totalFindings: result.triageReport.totalFindings,
        totalAutomationCandidates: result.automationReport.totalCandidates,
        handoverPath: result.handover.filePath,
      };
    }),
  );

cli
  .command(
    "export-artifacts",
    "最終成果物を出力する (brief, gap map, charters, findings, automation candidates)",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr-intake-id <prIntakeId>", "PR intake レコード ID")
  .action(
    createEnvelopeAction(async (options: ExportArtifactsCommandOptions) => {
      if (!options.prIntakeId) {
        throw new Error("--pr-intake-id オプションは必須です。");
      }

      const config = await readPluginConfig(options.config, options.manifest);

      const result = await exportArtifacts({
        prIntakeId: options.prIntakeId,
        config,
      });

      return {
        prIntakeId: options.prIntakeId,
        artifacts: result.artifacts,
        handoverPath: result.handover.filePath,
      };
    }),
  );

cli
  .command("progress summary", "DB から progress-summary.md を再生成する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .action(
    createEnvelopeAction(async (options: WorkspaceCommandOptions) => {
      const result = await writeProgressSummary(
        options.config,
        options.manifest,
      );

      return {
        filePath: result.filePath,
        currentStep: result.currentStep,
        steps: result.snapshots.length,
        completedSteps: result.snapshots.filter(
          (snapshot) =>
            snapshot.status === "completed" || snapshot.status === "skipped",
        ).length,
      };
    }),
  );

cli
  .command("progress handover", "step handover 文書を書き出して同期する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--step <stepName>", "workflow step 名")
  .option(
    "--status <status>",
    "pending | in_progress | completed | interrupted | failed | skipped",
  )
  .option("--summary <summary>", "handover 用の短い要約")
  .option("--next-step <nextStep>", "次の workflow step 名")
  .option("--body <body>", "handover 本文の Markdown")
  .option("--body-file <bodyFile>", "handover 本文 Markdown ファイルのパス")
  .action(
    createEnvelopeAction(async (options: HandoverCommandOptions) => {
      if (!options.step || !options.status || !options.summary) {
        throw new Error("--step、--status、--summary は必須です。");
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
          enforceWorkflowPrerequisites: true,
        },
        options.config,
        options.manifest,
      );

      return {
        filePath: result.filePath,
        step: result.snapshot.stepName,
        status: result.snapshot.status,
        nextStep: result.snapshot.nextStep,
        updatedAt: result.snapshot.updatedAt,
      };
    }),
  );

// ---------------------------------------------------------------------------
// handoff commands (GitHub Issue integration)
// ---------------------------------------------------------------------------

cli
  .command("handoff create-issue", "QA handoff Issue を GitHub に作成する")
  .option("--repository <repository>", "リポジトリ名 (owner/repo 形式)")
  .option("--title <title>", "Issue タイトル")
  .option("--body <body>", "Issue 本文の Markdown")
  .option("--body-file <bodyFile>", "Issue 本文 Markdown ファイルのパス")
  .option("--label <label>", "ラベル（複数指定可）")
  .option("--assignee <assignee>", "アサイン先（複数指定可）")
  .option("--cwd <cwd>", "作業ディレクトリ (デフォルト: cwd)")
  .action(
    createEnvelopeAction(async (options: HandoffCreateCommandOptions) => {
      if (!options.repository) {
        throw new Error("--repository オプションは必須です。");
      }
      if (!options.title) {
        throw new Error("--title オプションは必須です。");
      }

      const body = await readBodyOption(options.body, options.bodyFile);
      if (!body) {
        throw new Error("--body か --body-file のどちらかは必須です。");
      }

      const labels = normalizeArrayOption(options.label);
      const assignees = normalizeArrayOption(options.assignee);

      const result = await runCreateHandoffIssueRaw({
        repositoryRoot: options.cwd ?? process.cwd(),
        repository: options.repository,
        title: options.title,
        body,
        labels: labels.length > 0 ? labels : undefined,
        assignees: assignees.length > 0 ? assignees : undefined,
      });

      return {
        issueNumber: result.issue.number,
        issueUrl: result.issue.url,
        title: result.issue.title,
      };
    }),
  );

cli
  .command("handoff update-issue", "既存の QA handoff Issue の本文を更新する")
  .option("--repository <repository>", "リポジトリ名 (owner/repo 形式)")
  .option("--issue-number <issueNumber>", "Issue 番号")
  .option("--body <body>", "更新後の Issue 本文の Markdown")
  .option(
    "--body-file <bodyFile>",
    "更新後の Issue 本文 Markdown ファイルのパス",
  )
  .option("--cwd <cwd>", "作業ディレクトリ (デフォルト: cwd)")
  .action(
    createEnvelopeAction(async (options: HandoffUpdateCommandOptions) => {
      if (!options.repository) {
        throw new Error("--repository オプションは必須です。");
      }
      const issueNumber = validatePositiveIssueNumber(options.issueNumber);

      const body = await readBodyOption(options.body, options.bodyFile);
      if (!body) {
        throw new Error("--body か --body-file のどちらかは必須です。");
      }

      await runUpdateHandoffIssueBody({
        repositoryRoot: options.cwd ?? process.cwd(),
        repository: options.repository,
        issueNumber,
        body,
      });

      return {
        issueNumber,
        updated: true,
      };
    }),
  );

cli
  .command("handoff add-comment", "QA handoff Issue にコメントを追加する")
  .option("--repository <repository>", "リポジトリ名 (owner/repo 形式)")
  .option("--issue-number <issueNumber>", "Issue 番号")
  .option("--body <body>", "コメント本文の Markdown")
  .option("--body-file <bodyFile>", "コメント本文 Markdown ファイルのパス")
  .option("--cwd <cwd>", "作業ディレクトリ (デフォルト: cwd)")
  .action(
    createEnvelopeAction(async (options: HandoffCommentCommandOptions) => {
      if (!options.repository) {
        throw new Error("--repository オプションは必須です。");
      }
      const issueNumber = validatePositiveIssueNumber(options.issueNumber);

      const body = await readBodyOption(options.body, options.bodyFile);
      if (!body) {
        throw new Error("--body か --body-file のどちらかは必須です。");
      }

      const result = await runAddHandoffCommentRaw({
        repositoryRoot: options.cwd ?? process.cwd(),
        repository: options.repository,
        issueNumber,
        body,
      });

      return {
        issueNumber,
        commentUrl: result.comment.url,
      };
    }),
  );

cli
  .command(
    "handoff generate",
    "allocation 結果から QA handoff Markdown を生成する",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option(
    "--risk-assessment-id <riskAssessmentId>",
    "risk assessment レコード ID",
  )
  .action(
    createEnvelopeAction(async (options: HandoffGenerateCommandOptions) => {
      if (options.riskAssessmentId === undefined) {
        throw new Error("--risk-assessment-id オプションは必須です。");
      }

      const result = await generateHandoffMarkdown({
        riskAssessmentId: options.riskAssessmentId,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        riskAssessmentId: result.riskAssessmentId,
        repository: result.repository,
        markdown: result.markdown,
        summary: result.summary,
      };
    }),
  );

cli
  .command("handoff publish", "allocation 結果から QA handoff Issue を作成する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option(
    "--risk-assessment-id <riskAssessmentId>",
    "risk assessment レコード ID",
  )
  .option("--title <title>", "Issue タイトル")
  .option("--label <label>", "ラベル（複数指定可）")
  .option("--assignee <assignee>", "アサイン先（複数指定可）")
  .action(
    createEnvelopeAction(async (options: HandoffPublishCommandOptions) => {
      if (options.riskAssessmentId === undefined) {
        throw new Error("--risk-assessment-id オプションは必須です。");
      }

      const labels = normalizeArrayOption(options.label);
      const assignees = normalizeArrayOption(options.assignee);
      const result = await runCreateHandoffIssue({
        riskAssessmentId: options.riskAssessmentId,
        title: options.title,
        labels: labels.length > 0 ? labels : undefined,
        assignees: assignees.length > 0 ? assignees : undefined,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        riskAssessmentId: result.markdown.riskAssessmentId,
        issueNumber: result.issue.number,
        issueUrl: result.issue.url,
        title: result.issue.title,
      };
    }),
  );

cli
  .command("handoff update", "allocation 結果から QA handoff Issue を更新する")
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option(
    "--risk-assessment-id <riskAssessmentId>",
    "risk assessment レコード ID",
  )
  .option("--issue-number <issueNumber>", "Issue 番号")
  .action(
    createEnvelopeAction(
      async (options: HandoffAllocationUpdateCommandOptions) => {
        if (options.riskAssessmentId === undefined) {
          throw new Error("--risk-assessment-id オプションは必須です。");
        }
        const issueNumber = validatePositiveIssueNumber(options.issueNumber);

        const result = await runUpdateHandoffIssue({
          riskAssessmentId: options.riskAssessmentId,
          issueNumber,
          configPath: options.config,
          manifestPath: options.manifest,
        });

        return {
          riskAssessmentId: result.markdown.riskAssessmentId,
          issueNumber: result.issueNumber,
          updated: true,
        };
      },
    ),
  );

cli
  .command(
    "handoff add-findings",
    "session findings を QA handoff Issue に追記する",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--issue-number <issueNumber>", "Issue 番号")
  .option("--session-id <sessionId>", "Session ID")
  .action(
    createEnvelopeAction(async (options: HandoffFindingsCommandOptions) => {
      const issueNumber = validatePositiveIssueNumber(options.issueNumber);

      if (options.sessionId === undefined) {
        throw new Error("--session-id オプションは必須です。");
      }

      const result = await runAddHandoffComment({
        issueNumber,
        sessionId: options.sessionId,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return {
        issueNumber,
        commentUrl: result.comment.url,
      };
    }),
  );

cli.help();
export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    cli.parse(argv);
  } catch (error) {
    process.exitCode = 1;
    emitJsonEnvelope(formatErrorEnvelope(error));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}

async function readBodyOption(
  inlineBody: string | undefined,
  bodyFile: string | undefined,
): Promise<string | null> {
  if (inlineBody && bodyFile) {
    throw new Error(
      "--body か --body-file のどちらか一方だけを指定してください。",
    );
  }

  if (bodyFile) {
    return readFile(bodyFile, "utf8");
  }

  return inlineBody ?? null;
}

function normalizeArrayOption(
  value: string | string[] | undefined,
): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

function validatePositiveIssueNumber(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw new Error("--issue-number は正の整数を指定してください。");
  }
  return value;
}
