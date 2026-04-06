import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

export type FindIssueInput = {
  readonly repositoryRoot: string;
  readonly repository: string;
  readonly searchQuery: string;
};

// --- Public functions ---

export async function createIssue(
  input: CreateIssueInput,
): Promise<CreatedIssue> {
  // Use --body-file to avoid command-line argument length limits
  const bodyFile = await writeBodyToTempFile(input.body);

  try {
    const args = [
      "issue",
      "create",
      "--repo",
      input.repository,
      "--title",
      input.title,
      "--body-file",
      bodyFile,
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

    // gh issue create outputs the issue URL to stdout (no --json support)
    const rawUrl = result.stdout.trim();
    const issueNumber = parseIssueNumberFromUrl(rawUrl);

    return createdIssueSchema.parse({
      number: issueNumber,
      url: rawUrl,
      title: input.title,
    });
  } finally {
    await cleanupTempFile(bodyFile);
  }
}

export async function editIssueBody(input: EditIssueInput): Promise<void> {
  const bodyFile = await writeBodyToTempFile(input.body);

  try {
    const args = [
      "issue",
      "edit",
      String(input.issueNumber),
      "--repo",
      input.repository,
      "--body-file",
      bodyFile,
    ];

    await runGhIssueCommand(args, input.repositoryRoot);
  } finally {
    await cleanupTempFile(bodyFile);
  }
}

export async function addIssueComment(
  input: AddCommentInput,
): Promise<CreatedComment> {
  const bodyFile = await writeBodyToTempFile(input.body);

  try {
    const args = [
      "issue",
      "comment",
      String(input.issueNumber),
      "--repo",
      input.repository,
      "--body-file",
      bodyFile,
    ];

    // gh issue comment は JSON を返さず、プレーンテキスト URL を stdout に出力する
    const result = await runGhIssueCommand(args, input.repositoryRoot);
    const rawUrl = result.stdout.trim();
    return createdCommentSchema.parse({ url: rawUrl });
  } finally {
    await cleanupTempFile(bodyFile);
  }
}

export async function findIssueBySearch(
  input: FindIssueInput,
): Promise<CreatedIssue | null> {
  const args = [
    "issue",
    "list",
    "--repo",
    input.repository,
    "--search",
    input.searchQuery,
    "--json",
    "number,url,title",
    "--state",
    "open",
    "--limit",
    "1",
  ];

  const result = await runGhIssueCommand(args, input.repositoryRoot);
  const json = JSON.parse(result.stdout) as unknown;

  if (!Array.isArray(json) || json.length === 0) {
    return null;
  }

  return createdIssueSchema.parse(json[0]);
}

// --- Private helpers ---

async function writeBodyToTempFile(body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gh-issue-body-"));
  const filePath = join(dir, "body.md");
  await writeFile(filePath, body, "utf8");
  return filePath;
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    const dir = join(filePath, "..");
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

function parseIssueNumberFromUrl(url: string): number {
  const match = url.match(/\/issues\/(\d+)/);
  if (!match) {
    throw new Error(`Could not parse issue number from URL: ${url}`);
  }
  return Number(match[1]);
}

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
