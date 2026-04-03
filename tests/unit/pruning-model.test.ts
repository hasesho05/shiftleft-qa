import { describe, expect, it } from "vitest";

import {
  DEFAULT_ESTIMATED_MINUTES,
  DEFAULT_EXPLORATION_BUDGET_MINUTES,
  PROTECTED_RISK_SIGNALS,
  PRUNING_DROP_REASONS,
  droppedItemSchema,
  pruningResultSchema,
} from "../../src/exploratory-testing/models/pruning";

describe("pruning model", () => {
  it("validates a well-formed DroppedItem", () => {
    const result = droppedItemSchema.safeParse({
      title: "Manual exploration for src/a.ts (error-path)",
      changedFilePaths: ["src/a.ts"],
      riskLevel: "medium",
      reason: "budget-exceeded",
      estimatedMinutes: 20,
    });
    expect(result.success).toBe(true);
  });

  it("rejects DroppedItem with empty title", () => {
    const result = droppedItemSchema.safeParse({
      title: "",
      changedFilePaths: ["src/a.ts"],
      riskLevel: "medium",
      reason: "budget-exceeded",
      estimatedMinutes: 20,
    });
    expect(result.success).toBe(false);
  });

  it("rejects DroppedItem with invalid reason", () => {
    const result = droppedItemSchema.safeParse({
      title: "Test",
      changedFilePaths: ["src/a.ts"],
      riskLevel: "medium",
      reason: "unknown-reason",
      estimatedMinutes: 20,
    });
    expect(result.success).toBe(false);
  });

  it("rejects DroppedItem with zero estimatedMinutes", () => {
    const result = droppedItemSchema.safeParse({
      title: "Test",
      changedFilePaths: ["src/a.ts"],
      riskLevel: "low",
      reason: "duplicate",
      estimatedMinutes: 0,
    });
    expect(result.success).toBe(false);
  });

  it("validates a well-formed PruningResult", () => {
    const result = pruningResultSchema.safeParse({
      selectedItemIds: [1, 2, 3],
      droppedItems: [
        {
          title: "Dropped item",
          changedFilePaths: ["src/b.ts"],
          riskLevel: "low",
          reason: "budget-exceeded",
          estimatedMinutes: 10,
        },
      ],
      totalEstimatedMinutes: 80,
      budgetMinutes: 120,
      budgetUsedMinutes: 60,
    });
    expect(result.success).toBe(true);
  });

  it("validates PruningResult with zero selected items", () => {
    const result = pruningResultSchema.safeParse({
      selectedItemIds: [],
      droppedItems: [],
      totalEstimatedMinutes: 0,
      budgetMinutes: 120,
      budgetUsedMinutes: 0,
    });
    expect(result.success).toBe(true);
  });

  it("defines 3 drop reasons", () => {
    expect(PRUNING_DROP_REASONS).toHaveLength(3);
    expect(PRUNING_DROP_REASONS).toContain("duplicate");
    expect(PRUNING_DROP_REASONS).toContain("budget-exceeded");
    expect(PRUNING_DROP_REASONS).toContain("dev-box-covered");
  });

  it("defines default budget of 120 minutes", () => {
    expect(DEFAULT_EXPLORATION_BUDGET_MINUTES).toBe(120);
  });

  it("defines default estimated minutes per risk level", () => {
    expect(DEFAULT_ESTIMATED_MINUTES.high).toBe(30);
    expect(DEFAULT_ESTIMATED_MINUTES.medium).toBe(20);
    expect(DEFAULT_ESTIMATED_MINUTES.low).toBe(10);
  });

  it("defines 3 protected risk signals", () => {
    expect(PROTECTED_RISK_SIGNALS).toContain("cross-service");
    expect(PROTECTED_RISK_SIGNALS).toContain("async");
    expect(PROTECTED_RISK_SIGNALS).toContain("state-transition");
  });
});
