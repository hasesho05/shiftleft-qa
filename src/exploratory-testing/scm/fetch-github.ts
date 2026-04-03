import { execa } from "execa";

import type { PrMetadata } from "../models/pr-intake";
import {
  buildPrMetadata,
  ghRepoViewSchema,
  parseGhPrCommentsJson,
  parseGhPrFilesJson,
  parseGhPrJson,
} from "./github";

export type FetchGithubPrInput = {
  readonly prNumber: number;
  readonly repositoryRoot: string;
};

const EXTERNAL_COMMAND_TIMEOUT_MS = 30_000;

export async function fetchGithubPr(
  input: FetchGithubPrInput,
): Promise<PrMetadata> {
  const cwd = input.repositoryRoot;
  const prNumber = String(input.prNumber);

  const [prResult, repoResult] = await Promise.all([
    runGhCommand(
      [
        "pr",
        "view",
        prNumber,
        "--json",
        "number,title,body,author,baseRefName,headRefName,headRefOid,closingIssuesReferences,files,reviews",
      ],
      cwd,
    ),
    runGhCommand(["repo", "view", "--json", "nameWithOwner"], cwd),
  ]);

  const prJson = JSON.parse(prResult.stdout) as Record<string, unknown>;
  const repoJson = ghRepoViewSchema.parse(JSON.parse(repoResult.stdout));

  const prData = parseGhPrJson(prJson);
  const files = parseGhPrFilesJson(
    (prJson.files ?? []) as Record<string, unknown>[],
  );
  const comments = parseGhPrCommentsJson(
    (prJson.reviews ?? []) as Record<string, unknown>[],
  );

  return buildPrMetadata(repoJson.nameWithOwner, prData, files, comments);
}

async function runGhCommand(
  args: readonly string[],
  cwd: string,
): Promise<{ readonly stdout: string }> {
  try {
    return await execa("gh", [...args], {
      cwd,
      timeout: EXTERNAL_COMMAND_TIMEOUT_MS,
      reject: true,
      preferLocal: false,
    });
  } catch (error) {
    throw new Error(
      normalizeGhCommandError(error, {
        args,
        cwd,
        timeoutMs: EXTERNAL_COMMAND_TIMEOUT_MS,
      }),
    );
  }
}

export function normalizeGhCommandError(
  error: unknown,
  context?: {
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
  },
): string {
  if (error && typeof error === "object") {
    const record = error as {
      shortMessage?: unknown;
      stderr?: unknown;
      message?: unknown;
      timedOut?: unknown;
      exitCode?: unknown;
    };

    const detail = [record.shortMessage, record.stderr, record.message].find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    );

    if (context) {
      const prefix = `gh ${context.args.join(" ")}`.trim();
      const suffixParts = [`cwd=${context.cwd}`];

      if (record.timedOut === true) {
        suffixParts.push(`timed out after ${context.timeoutMs}ms`);
      } else if (typeof record.exitCode === "number") {
        suffixParts.push(`exit code ${record.exitCode}`);
      }

      if (detail) {
        suffixParts.push(detail.trim());
      }

      return `${prefix} の実行に失敗しました (${suffixParts.join("; ")})`;
    }

    if (detail) {
      return detail.trim();
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "gh コマンドの実行に失敗しました";
}
