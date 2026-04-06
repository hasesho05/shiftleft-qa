import { execa } from "execa";

import {
  buildExternalCommandRecoveryHint,
  normalizeExecaError,
} from "../lib/execa-error";
import type { PrMetadata } from "../models/pr-intake";
import {
  buildPrMetadata,
  ghIssueBodySchema,
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

const LINKED_ISSUE_REF_REGEX = /^#(\d+)$/;

export function parseLinkedIssueNumbers(
  linkedIssues: readonly string[],
): readonly number[] {
  const numbers: number[] = [];
  for (const ref of linkedIssues) {
    const match = LINKED_ISSUE_REF_REGEX.exec(ref);
    if (match) {
      numbers.push(Number(match[1]));
    }
  }
  return numbers;
}

export async function fetchLinkedIssueBodies(
  issueNumbers: readonly number[],
  cwd: string,
): Promise<ReadonlyMap<number, string>> {
  const results = await Promise.allSettled(
    issueNumbers.map(async (num) => {
      const result = await runGhCommand(
        ["issue", "view", String(num), "--json", "body"],
        cwd,
      );
      const parsed = ghIssueBodySchema.parse(JSON.parse(result.stdout));
      return { num, body: parsed.body ?? "" };
    }),
  );

  const bodies = new Map<number, string>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      bodies.set(result.value.num, result.value.body);
    }
    // best-effort: skip issues that failed to fetch
  }
  return bodies;
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
    const message = normalizeGhCommandError(error, {
      args,
      cwd,
      timeoutMs: EXTERNAL_COMMAND_TIMEOUT_MS,
    });
    const hint = buildExternalCommandRecoveryHint(error, "gh");

    throw new Error(hint ? `${message} ${hint}` : message);
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
  return normalizeExecaError(
    error,
    { command: "gh", ...context },
    "gh コマンドの実行に失敗しました",
  );
}
