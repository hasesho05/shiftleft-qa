import { z } from "zod";

import type {
  ChangedFile,
  PrMetadata,
  ReviewComment,
} from "../models/pr-intake";

// --- Zod schemas for gh CLI JSON output ---

const ghAuthorSchema = z.object({
  login: z.string(),
});

export const ghPrViewSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().default(null),
  author: ghAuthorSchema,
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  closingIssuesReferences: z
    .object({
      nodes: z.array(z.object({ number: z.number() })).default([]),
    })
    .default({ nodes: [] }),
});

export const ghPrFileSchema = z.object({
  path: z.string(),
  additions: z.number().default(0),
  deletions: z.number().default(0),
  status: z.string().default("MODIFIED"),
  previousFilename: z.string().optional(),
});

export const ghPrFilesResponseSchema = z.object({
  files: z.array(ghPrFileSchema).default([]),
});

export const ghReviewSchema = z.object({
  author: ghAuthorSchema,
  body: z.string().default(""),
  submittedAt: z.string().optional(),
});

export const ghReviewsResponseSchema = z.object({
  reviews: z.array(ghReviewSchema).default([]),
});

export const ghRepoViewSchema = z.object({
  nameWithOwner: z.string(),
});

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
