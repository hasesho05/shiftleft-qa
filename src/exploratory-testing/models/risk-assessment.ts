import {
  nonEmptyString,
  positiveInteger,
  schema,
  unitInterval,
  v,
} from "../lib/validation";

import { confidenceSchema } from "./change-analysis";
import { explorationPrioritySchema } from "./test-mapping";

export const explorationFrameworkSchema = schema(
  v.picklist([
    "equivalence-partitioning",
    "boundary-value-analysis",
    "state-transition",
    "decision-table",
    "cause-effect-graph",
    "pairwise",
    "sampling",
    "error-guessing",
  ]),
);

export type ExplorationFramework = v.InferOutput<
  typeof explorationFrameworkSchema
>;

export const riskFactorSchema = schema(
  v.object({
    factor: nonEmptyString(),
    weight: unitInterval(),
    contribution: v.pipe(v.number(), v.minValue(0)),
  }),
);

export type RiskFactor = v.InferOutput<typeof riskFactorSchema>;

export const riskScoreSchema = schema(
  v.object({
    changedFilePath: nonEmptyString(),
    overallRisk: confidenceSchema,
    factors: v.array(riskFactorSchema),
  }),
);

export type RiskScore = v.InferOutput<typeof riskScoreSchema>;

export const frameworkSelectionSchema = schema(
  v.object({
    framework: explorationFrameworkSchema,
    reason: nonEmptyString(),
    relevantFiles: v.array(nonEmptyString()),
    priority: explorationPrioritySchema,
  }),
);

export type FrameworkSelection = v.InferOutput<typeof frameworkSelectionSchema>;

export const explorationThemeSchema = schema(
  v.object({
    title: nonEmptyString(),
    description: nonEmptyString(),
    frameworks: v.pipe(v.array(explorationFrameworkSchema), v.minLength(1)),
    targetFiles: v.array(v.string()),
    riskLevel: explorationPrioritySchema,
    estimatedMinutes: positiveInteger(),
  }),
);

export type ExplorationTheme = v.InferOutput<typeof explorationThemeSchema>;

export const riskAssessmentResultSchema = schema(
  v.object({
    testMappingId: positiveInteger(),
    riskScores: v.array(riskScoreSchema),
    frameworkSelections: v.array(frameworkSelectionSchema),
    explorationThemes: v.array(explorationThemeSchema),
    assessedAt: nonEmptyString(),
  }),
);

export type RiskAssessmentResult = v.InferOutput<
  typeof riskAssessmentResultSchema
>;
