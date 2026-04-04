import { nonEmptyString, positiveInteger, schema, v } from "../lib/validation";

import { explorationFrameworkSchema } from "./risk-assessment";

export const observationCategorySchema = schema(
  v.picklist([
    "ui",
    "network",
    "console",
    "devtools",
    "state",
    "accessibility",
    "performance",
    "acceptance-criteria",
  ]),
);

export type ObservationCategory = v.InferOutput<
  typeof observationCategorySchema
>;

export const observationTargetSchema = schema(
  v.object({
    category: observationCategorySchema,
    description: nonEmptyString(),
  }),
);

export type ObservationTarget = v.InferOutput<typeof observationTargetSchema>;

export const sessionCharterSchema = schema(
  v.object({
    title: nonEmptyString(),
    goal: nonEmptyString(),
    scope: v.pipe(v.array(nonEmptyString()), v.minLength(1)),
    selectedFrameworks: v.pipe(
      v.array(explorationFrameworkSchema),
      v.minLength(1),
    ),
    preconditions: v.array(nonEmptyString()),
    observationTargets: v.pipe(
      v.array(observationTargetSchema),
      v.minLength(1),
    ),
    stopConditions: v.pipe(v.array(nonEmptyString()), v.minLength(1)),
    timeboxMinutes: positiveInteger(),
  }),
);

export type SessionCharter = v.InferOutput<typeof sessionCharterSchema>;

export const sessionCharterGenerationResultSchema = schema(
  v.object({
    riskAssessmentId: positiveInteger(),
    charters: v.array(sessionCharterSchema),
    generatedAt: nonEmptyString(),
  }),
);

export type SessionCharterGenerationResult = v.InferOutput<
  typeof sessionCharterGenerationResultSchema
>;
