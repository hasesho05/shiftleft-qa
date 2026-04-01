import { z } from "zod";

import { explorationFrameworkSchema } from "./risk-assessment";

export const observationCategorySchema = z.enum([
  "ui",
  "network",
  "console",
  "devtools",
  "state",
  "accessibility",
  "performance",
]);

export type ObservationCategory = z.infer<typeof observationCategorySchema>;

export const observationTargetSchema = z.object({
  category: observationCategorySchema,
  description: z.string().min(1),
});

export type ObservationTarget = z.infer<typeof observationTargetSchema>;

export const sessionCharterSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  scope: z.array(z.string().min(1)).min(1),
  selectedFrameworks: z.array(explorationFrameworkSchema).min(1),
  preconditions: z.array(z.string().min(1)),
  observationTargets: z.array(observationTargetSchema).min(1),
  stopConditions: z.array(z.string().min(1)).min(1),
  timeboxMinutes: z.number().int().min(1),
});

export type SessionCharter = z.infer<typeof sessionCharterSchema>;

export const sessionCharterGenerationResultSchema = z.object({
  riskAssessmentId: z.number().int().positive(),
  charters: z.array(sessionCharterSchema),
  generatedAt: z.string().min(1),
});

export type SessionCharterGenerationResult = z.infer<
  typeof sessionCharterGenerationResultSchema
>;
