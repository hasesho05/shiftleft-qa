import {
  nonEmptyString,
  nonNegativeInteger,
  positiveInteger,
  schema,
  v,
} from "../lib/validation";

export const progressStatusSchema = schema(
  v.picklist([
    "pending",
    "in_progress",
    "completed",
    "interrupted",
    "failed",
    "skipped",
  ]),
);

export const stepHandoverFrontmatterSchema = schema(
  v.object({
    step: positiveInteger(),
    step_name: nonEmptyString(),
    skill: nonEmptyString(),
    status: progressStatusSchema,
    updated_at: nonEmptyString(),
    completed_at: v.optional(v.nullable(nonEmptyString())),
    next_step: v.optional(v.nullable(nonEmptyString())),
  }),
);

export const progressSummaryFrontmatterSchema = schema(
  v.object({
    last_updated: nonEmptyString(),
    current_step: v.nullable(nonEmptyString()),
    completed_steps: nonNegativeInteger(),
    total_steps: nonNegativeInteger(),
  }),
);

export type ProgressStatus = v.InferOutput<typeof progressStatusSchema>;
export type StepHandoverFrontmatter = v.InferOutput<
  typeof stepHandoverFrontmatterSchema
>;
export type ProgressSummaryFrontmatter = v.InferOutput<
  typeof progressSummaryFrontmatterSchema
>;

export type StepHandoverDocument = {
  readonly frontmatter: StepHandoverFrontmatter;
  readonly body: string;
};

export type ProgressSummaryDocument = {
  readonly frontmatter: ProgressSummaryFrontmatter;
  readonly body: string;
};

export type StepProgressSnapshot = {
  readonly stepName: string;
  readonly stepOrder: number;
  readonly skillName: string;
  readonly title: string;
  readonly status: ProgressStatus;
  readonly summary: string;
  readonly nextStep: string | null;
  readonly progressPath: string | null;
  readonly updatedAt: string | null;
  readonly completedAt: string | null;
};

export type WriteStepHandoverInput = {
  readonly stepName: string;
  readonly status: ProgressStatus;
  readonly summary: string;
  readonly nextStep?: string | null;
  readonly body?: string | null;
  readonly updatedAt?: string;
  readonly completedAt?: string | null;
};
