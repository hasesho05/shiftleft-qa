import { execa } from "execa";

import { normalizeExecaError } from "../lib/execa-error";
import type { PrMetadata } from "../models/pr-intake";
import type { ResolvedScmProvider } from "./detect-provider";
import { resolveScmProvider } from "./detect-provider";
import { fetchGithubPr } from "./fetch-github";
import { fetchGitlabMr } from "./fetch-gitlab";

export type FetchPrInput = {
  readonly prNumber: number;
  readonly repositoryRoot: string;
  readonly scmProvider: string;
};

const EXTERNAL_COMMAND_TIMEOUT_MS = 30_000;

export async function fetchPrMetadata(
  input: FetchPrInput,
): Promise<PrMetadata> {
  try {
    const remoteUrl = await getGitRemoteUrl(input.repositoryRoot);
    const provider = resolveScmProvider(input.scmProvider, remoteUrl);

    return fetchByProvider(provider, {
      prNumber: input.prNumber,
      repositoryRoot: input.repositoryRoot,
    });
  } catch (error) {
    throw new Error(
      `PR メタデータの取得に失敗しました (${input.repositoryRoot}#${input.prNumber}): ${normalizeExternalCommandError(error)}`,
    );
  }
}

function fetchByProvider(
  provider: ResolvedScmProvider,
  input: { prNumber: number; repositoryRoot: string },
): Promise<PrMetadata> {
  switch (provider) {
    case "github":
      return fetchGithubPr(input);
    case "gitlab":
      return fetchGitlabMr(input);
  }
}

async function getGitRemoteUrl(cwd: string): Promise<string> {
  return runExternalCommand("git", ["remote", "get-url", "origin"], cwd);
}

async function runExternalCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  try {
    const result = await execa(command, [...args], {
      cwd,
      timeout: EXTERNAL_COMMAND_TIMEOUT_MS,
      reject: true,
      preferLocal: false,
    });

    return result.stdout.trim();
  } catch (error) {
    throw new Error(
      normalizeExternalCommandError(error, {
        command,
        args,
        cwd,
        timeoutMs: EXTERNAL_COMMAND_TIMEOUT_MS,
      }),
    );
  }
}

export function normalizeExternalCommandError(
  error: unknown,
  context?: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
  },
): string {
  return normalizeExecaError(
    error,
    context,
    "外部コマンドの実行に失敗しました",
  );
}
