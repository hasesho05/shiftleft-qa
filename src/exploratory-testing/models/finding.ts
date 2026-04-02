import { z } from "zod";

export const findingTypeSchema = z.enum([
  "defect",
  "spec-gap",
  "automation-candidate",
]);

export type FindingType = z.infer<typeof findingTypeSchema>;

export const recommendedTestLayerSchema = z.enum([
  "unit",
  "integration",
  "e2e",
  "visual",
  "api",
]);

export type RecommendedTestLayer = z.infer<typeof recommendedTestLayerSchema>;

export const findingSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const findingSchema = z.object({
  sessionId: z.number().int().positive(),
  observationId: z.number().int().positive(),
  type: findingTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  severity: findingSeveritySchema,
  recommendedTestLayer: recommendedTestLayerSchema.nullable(),
  automationRationale: z.string().min(1).nullable(),
});

export type Finding = z.infer<typeof findingSchema>;
