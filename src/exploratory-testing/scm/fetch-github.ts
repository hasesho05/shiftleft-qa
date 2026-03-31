import { execa } from "execa";

import type { PrMetadata } from "../models/pr-intake";
import {
  buildPrMetadata,
  ghPrFilesResponseSchema,
  ghPrViewSchema,
  ghRepoViewSchema,
  ghReviewsResponseSchema,
  parseGhPrFilesJson,
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

  const [prResult, filesResult, commentsResult, repoResult] = await Promise.all(
    [
      execa(
        "gh",
        [
          "pr",
          "view",
          prNumber,
          "--json",
          "number,title,body,author,baseRefName,headRefName,headRefOid,closingIssuesReferences",
        ],
        { cwd },
      ),
      execa("gh", ["pr", "view", prNumber, "--json", "files"], { cwd }),
      execa("gh", ["pr", "view", prNumber, "--json", "reviews"], { cwd }),
      execa("gh", ["repo", "view", "--json", "nameWithOwner"], { cwd }),
    ],
  );

  const prJson = ghPrViewSchema.parse(JSON.parse(prResult.stdout));
  const filesJson = ghPrFilesResponseSchema.parse(
    JSON.parse(filesResult.stdout),
  );
  const reviewsJson = ghReviewsResponseSchema.parse(
    JSON.parse(commentsResult.stdout),
  );
  const repoJson = ghRepoViewSchema.parse(JSON.parse(repoResult.stdout));

  const prData = {
    prNumber: prJson.number,
    title: prJson.title,
    description: prJson.body ?? "",
    author: prJson.author.login,
    baseBranch: prJson.baseRefName,
    headBranch: prJson.headRefName,
    headSha: prJson.headRefOid,
    linkedIssues: prJson.closingIssuesReferences.nodes.map(
      (node) => `#${node.number}`,
    ),
  };

  const files = parseGhPrFilesJson(
    filesJson.files as Record<string, unknown>[],
  );

  const comments = extractReviewComments(reviewsJson.reviews);

  return buildPrMetadata(repoJson.nameWithOwner, prData, files, comments);
}

function extractReviewComments(
  reviews: readonly {
    author: { login: string };
    body: string;
    submittedAt?: string;
  }[],
): PrMetadata["reviewComments"] {
  return reviews
    .filter((review) => review.body.trim().length > 0)
    .map((review) => ({
      author: review.author.login,
      body: review.body,
      path: null,
      createdAt: review.submittedAt ?? new Date().toISOString(),
    }));
}
