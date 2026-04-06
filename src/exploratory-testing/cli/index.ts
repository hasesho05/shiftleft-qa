import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { cac } from "cac";

import { normalizeExecaError } from "../lib/execa-error";
import { runAnalyzePr } from "../tools/analyze-pr";
import { runDesignHandoff } from "../tools/design-handoff";
import { createEnvironmentReport } from "../tools/doctor";
import {
  runAddHandoffCommentRaw,
  runCreateHandoffIssueRaw,
  runUpdateHandoffIssueBody,
} from "../tools/handoff";
import { readPluginManifest } from "../tools/manifest";
import { runPublishHandoffOrchestration } from "../tools/publish-handoff-orchestration";
import { initializeDatabaseFromConfig } from "../tools/setup";

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
  readonly output?: string;
};

type PublishHandoffCommandOptions = WorkspaceCommandOptions & {
  readonly pr?: number;
  readonly provider?: string;
  readonly repository?: string;
  readonly issueNumber?: number;
  readonly title?: string;
  readonly label?: string[];
  readonly assignee?: string[];
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

// ---------------------------------------------------------------------------
// Public flow orchestration commands
// ---------------------------------------------------------------------------

cli
  .command(
    "analyze-pr",
    "PR を解析し、intent / test coverage / risk を一括で取得する (public flow)",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .action(
    createEnvelopeAction(async (options: PrIntakeCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }

      const result = await runAnalyzePr({
        prNumber: options.pr,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return result;
    }),
  );

cli
  .command(
    "design-handoff",
    "analyze-pr の結果から QA handoff ドラフトを生成する (public flow)",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .option("--provider <provider>", "SCM プロバイダ (省略時は DB から解決)")
  .option("--repository <repository>", "リポジトリ (省略時は DB から解決)")
  .option("--output <outputPath>", "handoff markdown をファイルに書き出す")
  .action(
    createEnvelopeAction(async (options: PrPipelineCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }

      const result = await runDesignHandoff({
        prNumber: options.pr,
        provider: options.provider,
        repository: options.repository,
        configPath: options.config,
        manifestPath: options.manifest,
      });

      if (options.output) {
        await writeFile(options.output, result.draft.markdown, "utf8");
      }

      return {
        prNumber: result.prNumber,
        repository: result.repository,
        alreadyCovered: result.draft.alreadyCovered,
        shouldAutomate: result.draft.shouldAutomate,
        manualExploration: result.draft.manualExploration,
        counts: result.counts,
        summary: result.summary,
        ...(options.output ? { outputPath: options.output } : {}),
      };
    }),
  );

cli
  .command(
    "publish-handoff",
    "QA handoff を GitHub Issue として publish / update する (public flow)",
  )
  .option("--config <configPath>", "config.json のパス")
  .option("--manifest <manifestPath>", "plugin.json のパス")
  .option("--pr <prNumber>", "PR または MR 番号")
  .option("--provider <provider>", "SCM プロバイダ (省略時は DB から解決)")
  .option("--repository <repository>", "リポジトリ (省略時は DB から解決)")
  .option(
    "--issue-number <issueNumber>",
    "更新対象の Issue 番号 (省略時は新規作成)",
  )
  .option("--title <title>", "Issue タイトル (省略時は publishDefaults から)")
  .option("--label <label>", "Issue ラベル (複数指定可)")
  .option("--assignee <assignee>", "Issue アサイニー (複数指定可)")
  .action(
    createEnvelopeAction(async (options: PublishHandoffCommandOptions) => {
      if (!options.pr) {
        throw new Error("--pr オプションは必須です。");
      }

      const result = await runPublishHandoffOrchestration({
        prNumber: options.pr,
        provider: options.provider,
        repository: options.repository,
        issueNumber: options.issueNumber,
        title: options.title,
        labels: normalizeArrayOption(options.label),
        assignees: normalizeArrayOption(options.assignee),
        configPath: options.config,
        manifestPath: options.manifest,
      });

      return result;
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
