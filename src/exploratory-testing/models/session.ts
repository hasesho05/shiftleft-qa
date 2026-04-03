import {
  nonEmptyString,
  nonNegativeInteger,
  positiveInteger,
  schema,
  v,
} from "../lib/validation";

export const sessionStatusSchema = schema(
  v.picklist(["planned", "in_progress", "interrupted", "completed"]),
);

export type SessionStatus = v.InferOutput<typeof sessionStatusSchema>;

export const observationOutcomeSchema = schema(
  v.picklist(["pass", "fail", "unclear", "suspicious"]),
);

export type ObservationOutcome = v.InferOutput<typeof observationOutcomeSchema>;

export const observationSchema = schema(
  v.object({
    targetedHeuristic: nonEmptyString(),
    action: nonEmptyString(),
    expected: nonEmptyString(),
    actual: nonEmptyString(),
    outcome: observationOutcomeSchema,
    note: v.string(),
    evidencePath: v.nullable(nonEmptyString()),
  }),
);

export type Observation = v.InferOutput<typeof observationSchema>;

export const sessionSchema = schema(
  v.object({
    sessionChartersId: positiveInteger(),
    charterIndex: nonNegativeInteger(),
    charterTitle: nonEmptyString(),
    status: sessionStatusSchema,
    startedAt: v.nullable(nonEmptyString()),
    interruptedAt: v.nullable(nonEmptyString()),
    completedAt: v.nullable(nonEmptyString()),
    interruptReason: v.nullable(nonEmptyString()),
  }),
);

export type Session = v.InferOutput<typeof sessionSchema>;
