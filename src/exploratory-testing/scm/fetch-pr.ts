import { execa } from "execa";

import type { PrMetadata } from "../models/pr-intake";
import type { ResolvedScmProvider } from "./detect-provider";
import { resolveScmProvider } from "./detect-provider";
import { fetchGithubPr } from "./fetch-github";

export type FetchPrInput = {
  readonly prNumber: number;
  readonly repositoryRoot: string;
  readonly scmProvider: string;
};

export async function fetchPrMetadata(
  input: FetchPrInput,
): Promise<PrMetadata> {
  const remoteUrl = await getGitRemoteUrl(input.repositoryRoot);
  const provider = resolveScmProvider(input.scmProvider, remoteUrl);

  return fetchByProvider(provider, {
    prNumber: input.prNumber,
    repositoryRoot: input.repositoryRoot,
  });
}

function fetchByProvider(
  provider: ResolvedScmProvider,
  input: { prNumber: number; repositoryRoot: string },
): Promise<PrMetadata> {
  switch (provider) {
    case "github":
      return fetchGithubPr(input);
    case "gitlab":
      throw new Error(
        'Provider "gitlab" is not yet supported. Only "github" is currently implemented.',
      );
  }
}

async function getGitRemoteUrl(cwd: string): Promise<string> {
  const result = await execa("git", ["remote", "get-url", "origin"], { cwd });
  return result.stdout.trim();
}
