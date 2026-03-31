import { z } from "zod";

export const progressStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "interrupted",
  "failed",
  "skipped",
]);

export const stepHandoverFrontmatterSchema = z.object({
  step: z.number().int().positive(),
  step_name: z.string().min(1),
  skill: z.string().min(1),
  status: progressStatusSchema,
  updated_at: z.string().min(1),
  completed_at: z.string().min(1).nullable().optional(),
  next_step: z.string().min(1).nullable().optional(),
});

export const progressSummaryFrontmatterSchema = z.object({
  last_updated: z.string().min(1),
  current_step: z.string().min(1).nullable(),
  completed_steps: z.number().int().nonnegative(),
  total_steps: z.number().int().nonnegative(),
});

export type ProgressStatus = z.infer<typeof progressStatusSchema>;
export type StepHandoverFrontmatter = z.infer<
  typeof stepHandoverFrontmatterSchema
>;
export type ProgressSummaryFrontmatter = z.infer<
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
