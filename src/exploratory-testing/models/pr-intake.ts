import { z } from "zod";

import { scmProviderSchema } from "./config";

export const changedFileStatusSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
]);

export const changedFileSchema = z.object({
  path: z.string().min(1),
  status: changedFileStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  previousPath: z.string().nullable().default(null),
});

export const reviewCommentSchema = z.object({
  author: z.string().min(1),
  body: z.string(),
  path: z.string().nullable().default(null),
  createdAt: z.string().min(1),
});

export const prMetadataSchema = z.object({
  provider: scmProviderSchema.exclude(["auto"]),
  repository: z.string().min(1),
  prNumber: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  author: z.string().min(1),
  baseBranch: z.string().min(1),
  headBranch: z.string().min(1),
  headSha: z.string().min(1),
  linkedIssues: z.array(z.string()),
  changedFiles: z.array(changedFileSchema),
  reviewComments: z.array(reviewCommentSchema),
  fetchedAt: z.string().min(1),
});

export type ChangedFileStatus = z.infer<typeof changedFileStatusSchema>;
export type ChangedFile = z.infer<typeof changedFileSchema>;
export type ReviewComment = z.infer<typeof reviewCommentSchema>;
export type PrMetadata = z.infer<typeof prMetadataSchema>;
