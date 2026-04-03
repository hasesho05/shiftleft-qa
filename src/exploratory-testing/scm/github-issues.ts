import { execa } from "execa";

import { normalizeExecaError } from "../lib/execa-error";
import {
  type CreatedComment,
  type CreatedIssue,
  createdCommentSchema,
  createdIssueSchema,
} from "../models/github-issue";

const EXTERNAL_COMMAND_TIMEOUT_MS = 30_000;

// --- Input types ---

export type CreateIssueInput = {
  readonly repositoryRoot: string;
  readonly repository: string;
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
};

export type EditIssueInput = {
  readonly repositoryRoot: string;
  readonly repository: string;
  readonly issueNumber: number;
  readonly body: string;
};

export type AddCommentInput = {
  readonly repositoryRoot: string;
  readonly repository: string;
  readonly issueNumber: number;
  readonly body: string;
};

// --- Public functions ---

export async function createIssue(
  input: CreateIssueInput,
): Promise<CreatedIssue> {
  const args = [
    "issue",
    "create",
    "--repo",
    input.repository,
    "--title",
    input.title,
    "--body",
    input.body,
    "--json",
    "number,url,title",
  ];

  if (input.labels && input.labels.length > 0) {
    for (const label of input.labels) {
      args.push("--label", label);
    }
  }

  if (input.assignees && input.assignees.length > 0) {
    for (const assignee of input.assignees) {
      args.push("--assignee", assignee);
    }
  }

  const result = await runGhIssueCommand(args, input.repositoryRoot);
  const json = JSON.parse(result.stdout) as unknown;
  return createdIssueSchema.parse(json);
}

export async function editIssueBody(input: EditIssueInput): Promise<void> {
  const args = [
    "issue",
    "edit",
    String(input.issueNumber),
    "--repo",
    input.repository,
    "--body",
    input.body,
  ];

  await runGhIssueCommand(args, input.repositoryRoot);
}

export async function addIssueComment(
  input: AddCommentInput,
): Promise<CreatedComment> {
  const args = [
    "issue",
    "comment",
    String(input.issueNumber),
    "--repo",
    input.repository,
    "--body",
    input.body,
  ];

  // gh issue comment は JSON を返さず、プレーンテキスト URL を stdout に出力する
  const result = await runGhIssueCommand(args, input.repositoryRoot);
  const rawUrl = result.stdout.trim();
  return createdCommentSchema.parse({ url: rawUrl });
}

// --- Private helpers ---

async function runGhIssueCommand(
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
      normalizeExecaError(
        error,
        { command: "gh", args, cwd, timeoutMs: EXTERNAL_COMMAND_TIMEOUT_MS },
        "gh issue コマンドの実行に失敗しました",
      ),
    );
  }
}
