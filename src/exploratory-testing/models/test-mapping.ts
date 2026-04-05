import { nonEmptyString, positiveInteger, schema, v } from "../lib/validation";

import { confidenceSchema } from "./change-analysis";

export const testLayerSchema = schema(
  v.picklist(["unit", "e2e", "visual", "storybook", "api"]),
);

export type TestLayer = v.InferOutput<typeof testLayerSchema>;

export const coverageAspectSchema = schema(
  v.picklist([
    "happy-path",
    "error-path",
    "boundary",
    "permission",
    "state-transition",
    "mock-fixture",
  ]),
);

export type CoverageAspect = v.InferOutput<typeof coverageAspectSchema>;

export const coverageStatusSchema = schema(
  v.picklist(["covered", "uncovered", "partial"]),
);

export type CoverageStatus = v.InferOutput<typeof coverageStatusSchema>;

export const explorationPrioritySchema = schema(
  v.picklist(["high", "medium", "low"]),
);

export type ExplorationPriority = v.InferOutput<
  typeof explorationPrioritySchema
>;

export const coverageConfidenceSchema = schema(
  v.picklist(["confirmed", "inferred"]),
);

export type CoverageConfidence = v.InferOutput<typeof coverageConfidenceSchema>;

/** Numeric ordering for ExplorationPriority, usable in comparisons and sorts. */
export const EXPLORATION_PRIORITY_ORDER: Record<ExplorationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const stabilityStatusSchema = schema(
  v.picklist(["stable", "flaky", "quarantined", "unknown"]),
);

export type StabilityStatus = v.InferOutput<typeof stabilityStatusSchema>;

export const testAssetSchema = schema(
  v.object({
    path: nonEmptyString(),
    layer: testLayerSchema,
    relatedTo: v.array(nonEmptyString()),
    confidence: confidenceSchema,
    stability: v.optional(stabilityStatusSchema, "unknown"),
    stabilitySignals: v.optional(v.array(v.string()), []),
    stabilityNotes: v.optional(v.array(v.string()), []),
  }),
);

export type TestAsset = v.InferOutput<typeof testAssetSchema>;

export const testSummarySchema = schema(
  v.object({
    testAssetPath: nonEmptyString(),
    layer: testLayerSchema,
    coveredAspects: v.array(coverageAspectSchema),
    coverageConfidence: v.optional(coverageConfidenceSchema, "inferred"),
    description: nonEmptyString(),
  }),
);

export type TestSummary = v.InferOutput<typeof testSummarySchema>;

export const coverageGapEntrySchema = schema(
  v.object({
    changedFilePath: nonEmptyString(),
    aspect: coverageAspectSchema,
    status: coverageStatusSchema,
    coveredBy: v.array(v.string()),
    explorationPriority: explorationPrioritySchema,
    stabilityNotes: v.optional(v.array(v.string()), []),
  }),
);

export type CoverageGapEntry = v.InferOutput<typeof coverageGapEntrySchema>;

export const testMappingResultSchema = schema(
  v.object({
    prIntakeId: positiveInteger(),
    changeAnalysisId: positiveInteger(),
    testAssets: v.array(testAssetSchema),
    testSummaries: v.array(testSummarySchema),
    coverageGapMap: v.array(coverageGapEntrySchema),
    missingLayers: v.array(testLayerSchema),
    mappedAt: nonEmptyString(),
  }),
);

export type TestMappingResult = v.InferOutput<typeof testMappingResultSchema>;
