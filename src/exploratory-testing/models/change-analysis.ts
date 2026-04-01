import { z } from "zod";

export const changeCategorySchema = z.enum([
  "ui",
  "api",
  "validation",
  "state-transition",
  "permission",
  "async",
  "schema",
  "shared-component",
  "feature-flag",
  "cross-service",
]);

export type ChangeCategory = z.infer<typeof changeCategorySchema>;

export const confidenceSchema = z.number().min(0).max(1);

export const categorizedChangeSchema = z.object({
  category: changeCategorySchema,
  confidence: confidenceSchema,
  reason: z.string().min(1),
});

export type CategorizedChange = z.infer<typeof categorizedChangeSchema>;

export const fileChangeAnalysisSchema = z.object({
  path: z.string().min(1),
  status: z.enum(["added", "modified", "deleted", "renamed", "copied"]),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  categories: z.array(categorizedChangeSchema),
});

export type FileChangeAnalysis = z.infer<typeof fileChangeAnalysisSchema>;

export const relatedCodeCandidateSchema = z.object({
  path: z.string().min(1),
  relation: z.enum([
    "import",
    "export",
    "test",
    "config",
    "type-definition",
    "co-located",
    "shared-module",
  ]),
  confidence: confidenceSchema,
  reason: z.string().min(1),
});

export type RelatedCodeCandidate = z.infer<typeof relatedCodeCandidateSchema>;

export const viewpointSeedSchema = z.object({
  viewpoint: z.enum([
    "functional-user-flow",
    "user-persona",
    "ui-look-and-feel",
    "data-and-error-handling",
    "architecture-cross-cutting",
  ]),
  seeds: z.array(z.string().min(1)),
});

export type ViewpointSeed = z.infer<typeof viewpointSeedSchema>;

export const changeAnalysisResultSchema = z.object({
  prIntakeId: z.number().int().positive(),
  fileAnalyses: z.array(fileChangeAnalysisSchema),
  relatedCodes: z.array(relatedCodeCandidateSchema),
  viewpointSeeds: z.array(viewpointSeedSchema),
  summary: z.string().min(1),
  analyzedAt: z.string().min(1),
});

export type ChangeAnalysisResult = z.infer<typeof changeAnalysisResultSchema>;
