import { z } from "zod";

import { confidenceSchema } from "./change-analysis";

export const testLayerSchema = z.enum([
  "unit",
  "e2e",
  "visual",
  "storybook",
  "api",
]);

export type TestLayer = z.infer<typeof testLayerSchema>;

export const coverageAspectSchema = z.enum([
  "happy-path",
  "error-path",
  "boundary",
  "permission",
  "state-transition",
  "mock-fixture",
]);

export type CoverageAspect = z.infer<typeof coverageAspectSchema>;

export const coverageStatusSchema = z.enum(["covered", "uncovered", "partial"]);

export type CoverageStatus = z.infer<typeof coverageStatusSchema>;

export const explorationPrioritySchema = z.enum(["high", "medium", "low"]);

export type ExplorationPriority = z.infer<typeof explorationPrioritySchema>;

/** Numeric ordering for ExplorationPriority, usable in comparisons and sorts. */
export const EXPLORATION_PRIORITY_ORDER: Record<ExplorationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const testAssetSchema = z.object({
  path: z.string().min(1),
  layer: testLayerSchema,
  relatedTo: z.array(z.string().min(1)),
  confidence: confidenceSchema,
});

export type TestAsset = z.infer<typeof testAssetSchema>;

export const testSummarySchema = z.object({
  testAssetPath: z.string().min(1),
  layer: testLayerSchema,
  coveredAspects: z.array(coverageAspectSchema),
  description: z.string().min(1),
});

export type TestSummary = z.infer<typeof testSummarySchema>;

export const coverageGapEntrySchema = z.object({
  changedFilePath: z.string().min(1),
  aspect: coverageAspectSchema,
  status: coverageStatusSchema,
  coveredBy: z.array(z.string()),
  explorationPriority: explorationPrioritySchema,
});

export type CoverageGapEntry = z.infer<typeof coverageGapEntrySchema>;

export const testMappingResultSchema = z.object({
  prIntakeId: z.number().int().positive(),
  changeAnalysisId: z.number().int().positive(),
  testAssets: z.array(testAssetSchema),
  testSummaries: z.array(testSummarySchema),
  coverageGapMap: z.array(coverageGapEntrySchema),
  missingLayers: z.array(testLayerSchema),
  mappedAt: z.string().min(1),
});

export type TestMappingResult = z.infer<typeof testMappingResultSchema>;
