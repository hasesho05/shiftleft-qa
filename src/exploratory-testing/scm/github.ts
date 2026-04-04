import { nonEmptyString, schema, v } from "../lib/validation";

import type {
  ChangedFile,
  PrMetadata,
  ReviewComment,
} from "../models/pr-intake";

// --- Valibot schemas for gh CLI JSON output ---

const ghAuthorSchema = schema(v.object({ login: v.string() }));

export const ghPrViewSchema = schema(
  v.object({
    number: v.number(),
    title: v.string(),
    body: v.optional(v.nullable(v.string()), null),
    author: ghAuthorSchema,
    baseRefName: v.string(),
    headRefName: v.string(),
    headRefOid: v.string(),
    closingIssuesReferences: v.optional(
      v.object({
        nodes: v.optional(v.array(v.object({ number: v.number() })), []),
      }),
      { nodes: [] },
    ),
  }),
);

export const ghPrFileSchema = schema(
  v.object({
    path: v.string(),
    additions: v.optional(v.number(), 0),
    deletions: v.optional(v.number(), 0),
    status: v.optional(v.string(), "MODIFIED"),
    previousFilename: v.optional(nonEmptyString()),
  }),
);

export const ghPrFilesResponseSchema = schema(
  v.object({
    files: v.optional(v.array(ghPrFileSchema), []),
  }),
);

export const ghReviewSchema = schema(
  v.object({
    author: ghAuthorSchema,
    body: v.optional(v.string(), ""),
    submittedAt: v.optional(nonEmptyString()),
  }),
);

export const ghReviewsResponseSchema = schema(
  v.object({
    reviews: v.optional(v.array(ghReviewSchema), []),
  }),
);

export const ghRepoViewSchema = schema(
  v.object({
    nameWithOwner: v.string(),
  }),
);

export const ghIssueBodySchema = schema(
  v.object({
    body: v.optional(v.nullable(v.string()), null),
  }),
);

// --- Data types ---

export type GhPrData = {
  readonly prNumber: number;
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly linkedIssues: readonly string[];
};

// --- Parse functions ---

export function parseGhPrJson(json: Record<string, unknown>): GhPrData {
  const parsed = ghPrViewSchema.parse(json);

  return {
    prNumber: parsed.number,
    title: parsed.title,
    description: parsed.body ?? "",
    author: parsed.author.login,
    baseBranch: parsed.baseRefName,
    headBranch: parsed.headRefName,
    headSha: parsed.headRefOid,
    linkedIssues: parsed.closingIssuesReferences.nodes.map(
      (node) => `#${node.number}`,
    ),
  };
}

export function parseGhPrFilesJson(
  json: readonly Record<string, unknown>[],
): readonly ChangedFile[] {
  return json.map((file) => {
    const parsed = ghPrFileSchema.parse(file);
    return {
      path: parsed.path,
      status: mapGhFileStatus(parsed.status),
      additions: parsed.additions,
      deletions: parsed.deletions,
      previousPath: parsed.previousFilename ?? null,
    };
  });
}

export function parseGhPrCommentsJson(
  json: readonly Record<string, unknown>[],
): readonly ReviewComment[] {
  return json
    .map((comment) => {
      const parsed = ghReviewSchema.parse(comment);
      return {
        author: parsed.author.login,
        body: parsed.body,
        path: null,
        createdAt: parsed.submittedAt ?? new Date().toISOString(),
      };
    })
    .filter((comment) => comment.body.trim().length > 0);
}

export function buildPrMetadata(
  repository: string,
  prData: GhPrData,
  files: readonly ChangedFile[],
  comments: readonly ReviewComment[],
): PrMetadata {
  return {
    provider: "github",
    repository,
    prNumber: prData.prNumber,
    title: prData.title,
    description: prData.description,
    author: prData.author,
    baseBranch: prData.baseBranch,
    headBranch: prData.headBranch,
    headSha: prData.headSha,
    linkedIssues: [...prData.linkedIssues],
    changedFiles: [...files],
    reviewComments: [...comments],
    fetchedAt: new Date().toISOString(),
  };
}

function mapGhFileStatus(ghStatus: string): ChangedFile["status"] {
  const statusMap: Record<string, ChangedFile["status"]> = {
    ADDED: "added",
    MODIFIED: "modified",
    REMOVED: "deleted",
    RENAMED: "renamed",
    COPIED: "copied",
  };

  const mapped = statusMap[ghStatus];
  if (!mapped) {
    throw new Error(
      `Unknown GitHub file status: "${ghStatus}". Expected one of: ${Object.keys(statusMap).join(", ")}`,
    );
  }
  return mapped;
}
