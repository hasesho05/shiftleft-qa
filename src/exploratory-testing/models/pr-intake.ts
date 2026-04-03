import {
  nonEmptyString,
  nonNegativeInteger,
  positiveInteger,
  schema,
  v,
} from "../lib/validation";

import { resolvedScmProviderSchema } from "./config";

export const changedFileStatusSchema = schema(
  v.picklist(["added", "modified", "deleted", "renamed", "copied"]),
);

export const changedFileSchema = schema(
  v.object({
    path: nonEmptyString(),
    status: changedFileStatusSchema,
    additions: nonNegativeInteger(),
    deletions: nonNegativeInteger(),
    previousPath: v.optional(v.nullable(nonEmptyString()), null),
  }),
);

export const reviewCommentSchema = schema(
  v.object({
    author: nonEmptyString(),
    body: v.string(),
    path: v.optional(v.nullable(nonEmptyString()), null),
    createdAt: nonEmptyString(),
  }),
);

export const prMetadataSchema = schema(
  v.object({
    provider: resolvedScmProviderSchema,
    repository: nonEmptyString(),
    prNumber: positiveInteger(),
    title: v.string(),
    description: v.string(),
    author: nonEmptyString(),
    baseBranch: nonEmptyString(),
    headBranch: nonEmptyString(),
    headSha: nonEmptyString(),
    linkedIssues: v.array(v.string()),
    changedFiles: v.array(changedFileSchema),
    reviewComments: v.array(reviewCommentSchema),
    fetchedAt: nonEmptyString(),
  }),
);

export type ChangedFileStatus = v.InferOutput<typeof changedFileStatusSchema>;
export type ChangedFile = v.InferOutput<typeof changedFileSchema>;
export type ReviewComment = v.InferOutput<typeof reviewCommentSchema>;
export type PrMetadata = v.InferOutput<typeof prMetadataSchema>;
