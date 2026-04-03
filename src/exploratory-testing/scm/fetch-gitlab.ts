import { execa } from "execa";

import { normalizeExecaError } from "../lib/execa-error";
import type { PrMetadata } from "../models/pr-intake";
import {
  buildGitlabPrMetadata,
  parseGlabCloseIssuesJson,
  parseGlabDiffsJson,
  parseGlabDiscussionsJson,
  parseGlabMrJson,
} from "./gitlab";

export type FetchGitlabMrInput = {
  readonly prNumber: number;
  readonly repositoryRoot: string;
};

const EXTERNAL_COMMAND_TIMEOUT_MS = 30_000;

export async function fetchGitlabMr(
  input: FetchGitlabMrInput,
): Promise<PrMetadata> {
  const cwd = input.repositoryRoot;
  const mrNumber = String(input.prNumber);

  const mrResult = await runGlabCommand(
    ["mr", "view", mrNumber, "--comments", "--output", "json"],
    cwd,
  );
  const mrJson = JSON.parse(mrResult.stdout) as Record<string, unknown>;
  const mrData = parseGlabMrJson(mrJson);

  const [diffsResult, issuesResult] = await Promise.all([
    runGlabCommand(
      [
        "api",
        "--paginate",
        `projects/${mrData.projectId}/merge_requests/${mrData.prNumber}/diffs`,
      ],
      cwd,
    ),
    runGlabCommand(
      [
        "api",
        "--paginate",
        `projects/${mrData.projectId}/merge_requests/${mrData.prNumber}/closes_issues`,
      ],
      cwd,
    ),
  ]);

  const diffsJson = JSON.parse(diffsResult.stdout) as Record<string, unknown>[];
  const issuesJson = JSON.parse(issuesResult.stdout) as Record<
    string,
    unknown
  >[];

  const files = parseGlabDiffsJson(diffsJson);
  const linkedIssues = parseGlabCloseIssuesJson(issuesJson);

  // Discussions are validated through glabMrViewSchema and passed via mrData
  const comments = parseGlabDiscussionsJson(mrData.discussions);

  return buildGitlabPrMetadata(mrData, files, comments, linkedIssues);
}

async function runGlabCommand(
  args: readonly string[],
  cwd: string,
): Promise<{ readonly stdout: string }> {
  try {
    return await execa("glab", [...args], {
      cwd,
      timeout: EXTERNAL_COMMAND_TIMEOUT_MS,
      reject: true,
      preferLocal: false,
    });
  } catch (error) {
    throw new Error(
      normalizeGlabCommandError(error, {
        args,
        cwd,
        timeoutMs: EXTERNAL_COMMAND_TIMEOUT_MS,
      }),
    );
  }
}

export function normalizeGlabCommandError(
  error: unknown,
  context?: {
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
  },
): string {
  return normalizeExecaError(
    error,
    { command: "glab", ...context },
    "glab コマンドの実行に失敗しました",
  );
}
