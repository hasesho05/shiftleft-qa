import { nonEmptyString, positiveInteger, schema, v } from "../lib/validation";

import { changeCategorySchema } from "./change-analysis";
import { confidenceSchema } from "./change-analysis";
import { coverageAspectSchema, testLayerSchema } from "./test-mapping";
import { explorationPrioritySchema } from "./test-mapping";

export const ALLOCATION_DESTINATIONS = [
  "review",
  "unit",
  "integration",
  "e2e",
  "visual",
  "dev-box",
  "manual-exploration",
  "skip",
] as const;

export const allocationDestinationSchema = schema(
  v.picklist(ALLOCATION_DESTINATIONS),
);

export type AllocationDestination = v.InferOutput<
  typeof allocationDestinationSchema
>;

export const allocationSourceSignalsSchema = schema(
  v.object({
    categories: v.array(changeCategorySchema),
    existingTestLayers: v.array(testLayerSchema),
    gapAspects: v.array(coverageAspectSchema),
    reviewComments: v.array(v.string()),
    riskSignals: v.array(v.string()),
  }),
);

export type AllocationSourceSignals = v.InferOutput<
  typeof allocationSourceSignalsSchema
>;

export const allocationItemSchema = schema(
  v.object({
    riskAssessmentId: positiveInteger(),
    title: nonEmptyString(),
    changedFilePaths: v.pipe(v.array(nonEmptyString()), v.minLength(1)),
    riskLevel: explorationPrioritySchema,
    recommendedDestination: allocationDestinationSchema,
    confidence: confidenceSchema,
    rationale: nonEmptyString(),
    sourceSignals: allocationSourceSignalsSchema,
  }),
);

export type AllocationItem = v.InferOutput<typeof allocationItemSchema>;

export type AllocationDestinationCounts = Record<AllocationDestination, number>;

export function createEmptyAllocationDestinationCounts(): AllocationDestinationCounts {
  return {
    review: 0,
    unit: 0,
    integration: 0,
    e2e: 0,
    visual: 0,
    "dev-box": 0,
    "manual-exploration": 0,
    skip: 0,
  };
}
