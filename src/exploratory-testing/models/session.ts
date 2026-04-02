import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "planned",
  "in_progress",
  "interrupted",
  "completed",
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const observationOutcomeSchema = z.enum([
  "pass",
  "fail",
  "unclear",
  "suspicious",
]);

export type ObservationOutcome = z.infer<typeof observationOutcomeSchema>;

export const observationSchema = z.object({
  targetedHeuristic: z.string().min(1),
  action: z.string().min(1),
  expected: z.string().min(1),
  actual: z.string().min(1),
  outcome: observationOutcomeSchema,
  note: z.string(),
  evidencePath: z.string().min(1).nullable(),
});

export type Observation = z.infer<typeof observationSchema>;

export const sessionSchema = z.object({
  sessionChartersId: z.number().int().positive(),
  charterIndex: z.number().int().min(0),
  charterTitle: z.string().min(1),
  status: sessionStatusSchema,
  startedAt: z.string().min(1).nullable(),
  interruptedAt: z.string().min(1).nullable(),
  completedAt: z.string().min(1).nullable(),
  interruptReason: z.string().min(1).nullable(),
});

export type Session = z.infer<typeof sessionSchema>;
