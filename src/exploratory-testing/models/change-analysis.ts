import {
  nonEmptyString,
  nonNegativeInteger,
  positiveInteger,
  schema,
  unitInterval,
  v,
} from "../lib/validation";

export const changeCategorySchema = schema(
  v.picklist([
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
  ]),
);

export type ChangeCategory = v.InferOutput<typeof changeCategorySchema>;

export const confidenceSchema = schema(unitInterval());

export const categorizedChangeSchema = schema(
  v.object({
    category: changeCategorySchema,
    confidence: confidenceSchema,
    reason: nonEmptyString(),
  }),
);

export type CategorizedChange = v.InferOutput<typeof categorizedChangeSchema>;

export const fileChangeAnalysisSchema = schema(
  v.object({
    path: nonEmptyString(),
    status: schema(
      v.picklist(["added", "modified", "deleted", "renamed", "copied"]),
    ),
    additions: nonNegativeInteger(),
    deletions: nonNegativeInteger(),
    categories: v.array(categorizedChangeSchema),
  }),
);

export type FileChangeAnalysis = v.InferOutput<typeof fileChangeAnalysisSchema>;

export const relatedCodeCandidateSchema = schema(
  v.object({
    path: nonEmptyString(),
    relation: schema(
      v.picklist([
        "import",
        "export",
        "test",
        "config",
        "type-definition",
        "co-located",
        "shared-module",
      ]),
    ),
    confidence: confidenceSchema,
    reason: nonEmptyString(),
  }),
);

export type RelatedCodeCandidate = v.InferOutput<
  typeof relatedCodeCandidateSchema
>;

export const viewpointSeedSchema = schema(
  v.object({
    viewpoint: schema(
      v.picklist([
        "functional-user-flow",
        "user-persona",
        "ui-look-and-feel",
        "data-and-error-handling",
        "architecture-cross-cutting",
      ]),
    ),
    seeds: v.array(nonEmptyString()),
  }),
);

export type ViewpointSeed = v.InferOutput<typeof viewpointSeedSchema>;

export const changeAnalysisResultSchema = schema(
  v.object({
    prIntakeId: positiveInteger(),
    fileAnalyses: v.array(fileChangeAnalysisSchema),
    relatedCodes: v.array(relatedCodeCandidateSchema),
    viewpointSeeds: v.array(viewpointSeedSchema),
    summary: nonEmptyString(),
    analyzedAt: nonEmptyString(),
  }),
);

export type ChangeAnalysisResult = v.InferOutput<
  typeof changeAnalysisResultSchema
>;
