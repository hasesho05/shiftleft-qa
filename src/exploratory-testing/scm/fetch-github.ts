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

export async function fetchGithubPr(
  input: FetchGithubPrInput,
): Promise<PrMetadata> {
  const cwd = input.repositoryRoot;
  const prNumber = String(input.prNumber);

  const [prResult, repoResult] = await Promise.all([
    execa(
      "gh",
      [
        "pr",
        "view",
        prNumber,
        "--json",
        "number,title,body,author,baseRefName,headRefName,headRefOid,closingIssuesReferences,files,reviews",
      ],
      { cwd },
    ),
    execa("gh", ["repo", "view", "--json", "nameWithOwner"], { cwd }),
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
