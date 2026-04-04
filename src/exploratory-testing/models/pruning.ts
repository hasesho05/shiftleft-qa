import { nonEmptyString, positiveInteger, schema, v } from "../lib/validation";

import { explorationPrioritySchema } from "./test-mapping";

export const PRUNING_DROP_REASONS = [
  "duplicate",
  "budget-exceeded",
  "dev-box-covered",
] as const;

export const pruningDropReasonSchema = schema(v.picklist(PRUNING_DROP_REASONS));

export type PruningDropReason = v.InferOutput<typeof pruningDropReasonSchema>;

export const DEFAULT_EXPLORATION_BUDGET_MINUTES = 120;

export const PROTECTED_RISK_SIGNALS = [
  "cross-service",
  "async",
  "state-transition",
] as const;

export const DEFAULT_ESTIMATED_MINUTES: Record<
  "high" | "medium" | "low",
  number
> = {
  high: 30,
  medium: 20,
  low: 10,
};

export const droppedItemSchema = schema(
  v.object({
    title: nonEmptyString(),
    changedFilePaths: v.pipe(v.array(nonEmptyString()), v.minLength(1)),
    riskLevel: explorationPrioritySchema,
    reason: pruningDropReasonSchema,
    estimatedMinutes: positiveInteger(),
  }),
);

export type DroppedItem = v.InferOutput<typeof droppedItemSchema>;

export const pruningResultSchema = schema(
  v.object({
    selectedItemIds: v.array(positiveInteger()),
    droppedItems: v.array(droppedItemSchema),
    totalEstimatedMinutes: v.pipe(v.number(), v.integer(), v.minValue(0)),
    budgetMinutes: positiveInteger(),
    budgetUsedMinutes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  }),
);

export type PruningResult = v.InferOutput<typeof pruningResultSchema>;
