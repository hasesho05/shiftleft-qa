import { nonEmptyString, positiveInteger, schema, v } from "../lib/validation";

export const findingTypeSchema = schema(
  v.picklist(["defect", "spec-gap", "automation-candidate"]),
);

export type FindingType = v.InferOutput<typeof findingTypeSchema>;

export const recommendedTestLayerSchema = schema(
  v.picklist(["unit", "integration", "e2e", "visual", "api"]),
);

export type RecommendedTestLayer = v.InferOutput<
  typeof recommendedTestLayerSchema
>;

export const findingSeveritySchema = schema(
  v.picklist(["low", "medium", "high", "critical"]),
);

export type FindingSeverity = v.InferOutput<typeof findingSeveritySchema>;

export const findingSchema = schema(
  v.pipe(
    v.object({
      sessionId: positiveInteger(),
      observationId: positiveInteger(),
      type: findingTypeSchema,
      title: nonEmptyString(),
      description: nonEmptyString(),
      severity: findingSeveritySchema,
      recommendedTestLayer: v.nullable(recommendedTestLayerSchema),
      automationRationale: v.nullable(nonEmptyString()),
    }),
    v.forward(
      v.check(
        (input) =>
          input.type !== "automation-candidate" ||
          input.recommendedTestLayer !== null,
        "recommendedTestLayer is required for automation-candidate findings",
      ),
      ["recommendedTestLayer"],
    ),
    v.forward(
      v.check(
        (input) =>
          input.type !== "automation-candidate" ||
          input.automationRationale !== null,
        "automationRationale is required for automation-candidate findings",
      ),
      ["automationRationale"],
    ),
  ),
);

export type Finding = v.InferOutput<typeof findingSchema>;
