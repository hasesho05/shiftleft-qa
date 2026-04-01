import { z } from "zod";

import { confidenceSchema } from "./change-analysis";
import { explorationPrioritySchema } from "./test-mapping";

export const explorationFrameworkSchema = z.enum([
  "equivalence-partitioning",
  "boundary-value-analysis",
  "state-transition",
  "decision-table",
  "cause-effect-graph",
  "pairwise",
  "sampling",
  "error-guessing",
]);

export type ExplorationFramework = z.infer<typeof explorationFrameworkSchema>;

export const riskFactorSchema = z.object({
  factor: z.string().min(1),
  weight: z.number().min(0).max(1),
  contribution: z.number().min(0),
});

export type RiskFactor = z.infer<typeof riskFactorSchema>;

export const riskScoreSchema = z.object({
  changedFilePath: z.string().min(1),
  overallRisk: confidenceSchema,
  factors: z.array(riskFactorSchema),
});

export type RiskScore = z.infer<typeof riskScoreSchema>;

export const frameworkSelectionSchema = z.object({
  framework: explorationFrameworkSchema,
  reason: z.string().min(1),
  relevantFiles: z.array(z.string().min(1)),
  priority: explorationPrioritySchema,
});

export type FrameworkSelection = z.infer<typeof frameworkSelectionSchema>;

export const explorationThemeSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  frameworks: z.array(explorationFrameworkSchema).min(1),
  targetFiles: z.array(z.string()),
  riskLevel: explorationPrioritySchema,
  estimatedMinutes: z.number().int().min(1),
});

export type ExplorationTheme = z.infer<typeof explorationThemeSchema>;

export const riskAssessmentResultSchema = z.object({
  testMappingId: z.number().int().positive(),
  riskScores: z.array(riskScoreSchema),
  frameworkSelections: z.array(frameworkSelectionSchema),
  explorationThemes: z.array(explorationThemeSchema),
  assessedAt: z.string().min(1),
});

export type RiskAssessmentResult = z.infer<typeof riskAssessmentResultSchema>;
