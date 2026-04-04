import { describe, expect, it } from "vitest";

import { pruneManualExplorationItems } from "../../src/exploratory-testing/analysis/prune-manual-exploration";
import type { PersistedAllocationItem } from "../../src/exploratory-testing/db/workspace-repository";
import type { ExplorationTheme } from "../../src/exploratory-testing/models/risk-assessment";

function makeManualItem(
  overrides: Partial<PersistedAllocationItem> & { id: number },
): PersistedAllocationItem {
  return {
    riskAssessmentId: 1,
    title: `Manual exploration for src/file-${overrides.id}.ts (error-path)`,
    changedFilePaths: [`src/file-${overrides.id}.ts`],
    riskLevel: "medium",
    recommendedDestination: "manual-exploration",
    confidence: 0.35,
    rationale: "test rationale",
    sourceSignals: {
      categories: [],
      existingTestLayers: [],
      gapAspects: ["error-path"],
      reviewComments: [],
      riskSignals: [],
    },
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeDevBoxItem(
  overrides: Partial<PersistedAllocationItem> & { id: number },
): PersistedAllocationItem {
  return {
    ...makeManualItem(overrides),
    recommendedDestination: "dev-box",
    ...overrides,
  };
}

function makeTheme(
  overrides: Partial<ExplorationTheme> & { title: string },
): ExplorationTheme {
  return {
    description: "test theme",
    frameworks: ["error-guessing"],
    targetFiles: ["src/file-1.ts"],
    riskLevel: "medium",
    estimatedMinutes: 20,
    ...overrides,
  };
}

describe("pruneManualExplorationItems", () => {
  describe("P1: duplicate theme merging", () => {
    it("merges items targeting the same file with overlapping risk signals", () => {
      const items = [
        makeManualItem({
          id: 1,
          changedFilePaths: ["src/payment.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["error-path"],
            reviewComments: [],
            riskSignals: ["risk:0.800"],
          },
        }),
        makeManualItem({
          id: 2,
          changedFilePaths: ["src/payment.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["boundary"],
            reviewComments: [],
            riskSignals: ["risk:0.800"],
          },
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [],
        budgetMinutes: 120,
      });

      // One item merged, one dropped as duplicate
      expect(result.selectedItemIds).toHaveLength(1);
      expect(result.droppedItems).toHaveLength(1);
      expect(result.droppedItems[0].reason).toBe("duplicate");
    });

    it("transitively merges groups when a bridging item overlaps both", () => {
      // signals [a], [b], [a,b] should collapse into one group → 2 dropped
      const items = [
        makeManualItem({
          id: 1,
          changedFilePaths: ["src/payment.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["error-path"],
            reviewComments: [],
            riskSignals: ["signal-a"],
          },
        }),
        makeManualItem({
          id: 2,
          changedFilePaths: ["src/payment.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["boundary"],
            reviewComments: [],
            riskSignals: ["signal-b"],
          },
        }),
        makeManualItem({
          id: 3,
          riskLevel: "high",
          changedFilePaths: ["src/payment.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["error-path"],
            reviewComments: [],
            riskSignals: ["signal-a", "signal-b"],
          },
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [],
        budgetMinutes: 120,
      });

      // All 3 share a group transitively; highest-risk (id=3) kept, 2 dropped
      expect(result.selectedItemIds).toHaveLength(1);
      expect(result.selectedItemIds).toContain(3);
      expect(result.droppedItems).toHaveLength(2);
      expect(result.droppedItems.every((d) => d.reason === "duplicate")).toBe(
        true,
      );
    });
  });

  describe("P2: risk level priority", () => {
    it("orders high risk items before medium and low", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "low",
          changedFilePaths: ["src/low.ts"],
        }),
        makeManualItem({
          id: 2,
          riskLevel: "high",
          changedFilePaths: ["src/high.ts"],
        }),
        makeManualItem({
          id: 3,
          riskLevel: "medium",
          changedFilePaths: ["src/med.ts"],
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [],
        budgetMinutes: 120,
      });

      // All within budget, but selectedItemIds should be ordered high → medium → low
      expect(result.selectedItemIds).toEqual([2, 3, 1]);
    });
  });

  describe("P3: timebox budget constraint", () => {
    it("drops low risk items first when budget exceeded", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "high",
          changedFilePaths: ["src/h.ts"],
        }),
        makeManualItem({
          id: 2,
          riskLevel: "medium",
          changedFilePaths: ["src/m.ts"],
        }),
        makeManualItem({
          id: 3,
          riskLevel: "low",
          changedFilePaths: ["src/l.ts"],
        }),
      ];

      const themes = [
        makeTheme({
          title: "H",
          targetFiles: ["src/h.ts"],
          riskLevel: "high",
          estimatedMinutes: 30,
        }),
        makeTheme({
          title: "M",
          targetFiles: ["src/m.ts"],
          riskLevel: "medium",
          estimatedMinutes: 20,
        }),
        makeTheme({
          title: "L",
          targetFiles: ["src/l.ts"],
          riskLevel: "low",
          estimatedMinutes: 10,
        }),
      ];

      // Budget=55: high(30) + medium(20) = 50 fits; low(10) overflows at 60 > 55
      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes,
        budgetMinutes: 55,
      });

      expect(result.selectedItemIds).toContain(1); // high kept
      expect(result.selectedItemIds).toContain(2); // medium kept
      expect(
        result.droppedItems.some((d) => d.reason === "budget-exceeded"),
      ).toBe(true);
      expect(result.budgetUsedMinutes).toBeLessThanOrEqual(55);
    });

    it("drops medium items with high confidence after all low items", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "high",
          changedFilePaths: ["src/h.ts"],
        }),
        makeManualItem({
          id: 2,
          riskLevel: "medium",
          confidence: 0.85,
          changedFilePaths: ["src/m1.ts"],
        }),
        makeManualItem({
          id: 3,
          riskLevel: "medium",
          confidence: 0.35,
          changedFilePaths: ["src/m2.ts"],
        }),
      ];

      const themes = [
        makeTheme({
          title: "H",
          targetFiles: ["src/h.ts"],
          riskLevel: "high",
          estimatedMinutes: 30,
        }),
        makeTheme({
          title: "M1",
          targetFiles: ["src/m1.ts"],
          riskLevel: "medium",
          estimatedMinutes: 20,
        }),
        makeTheme({
          title: "M2",
          targetFiles: ["src/m2.ts"],
          riskLevel: "medium",
          estimatedMinutes: 20,
        }),
      ];

      // Budget = 55, so high(30) + one medium(20) = 50, second medium doesn't fit
      // The high-confidence medium (0.85, closer to automation) should be dropped first
      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes,
        budgetMinutes: 55,
      });

      expect(result.selectedItemIds).toContain(1); // high kept
      expect(result.selectedItemIds).toContain(3); // low-confidence medium kept
      // Item id=2 (high confidence medium) should be dropped
      expect(result.droppedItems.some((d) => d.title.includes("file-2"))).toBe(
        true,
      );
    });

    it("never drops high risk items even when over budget", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "high",
          changedFilePaths: ["src/h1.ts"],
        }),
        makeManualItem({
          id: 2,
          riskLevel: "high",
          changedFilePaths: ["src/h2.ts"],
        }),
      ];

      const themes = [
        makeTheme({
          title: "H1",
          targetFiles: ["src/h1.ts"],
          riskLevel: "high",
          estimatedMinutes: 30,
        }),
        makeTheme({
          title: "H2",
          targetFiles: ["src/h2.ts"],
          riskLevel: "high",
          estimatedMinutes: 30,
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes,
        budgetMinutes: 10, // Very tight budget
      });

      // High items are never dropped
      expect(result.selectedItemIds).toHaveLength(2);
      expect(result.droppedItems).toHaveLength(0);
    });
  });

  describe("P4: dev-box covered exclusion", () => {
    it("drops manual items whose file+aspect overlap with dev-box items", () => {
      const manualItems = [
        makeManualItem({
          id: 1,
          changedFilePaths: ["src/shared.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["happy-path"],
            reviewComments: [],
            riskSignals: [],
          },
        }),
        makeManualItem({
          id: 2,
          changedFilePaths: ["src/unique.ts"],
        }),
      ];

      const devBoxItems = [
        makeDevBoxItem({
          id: 10,
          changedFilePaths: ["src/shared.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["happy-path"],
            reviewComments: [],
            riskSignals: [],
          },
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems,
        devBoxItems,
        themes: [],
        budgetMinutes: 120,
      });

      expect(result.selectedItemIds).toContain(2);
      expect(result.droppedItems).toHaveLength(1);
      expect(result.droppedItems[0].reason).toBe("dev-box-covered");
    });

    it("keeps deep exploration items even when dev-box covers the same file", () => {
      const manualItems = [
        makeManualItem({
          id: 1,
          riskLevel: "high",
          changedFilePaths: ["src/shared.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["error-path"],
            reviewComments: [],
            riskSignals: ["cross-service"],
          },
        }),
      ];

      const devBoxItems = [
        makeDevBoxItem({
          id: 10,
          changedFilePaths: ["src/shared.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["happy-path"],
            reviewComments: [],
            riskSignals: [],
          },
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems,
        devBoxItems,
        themes: [],
        budgetMinutes: 120,
      });

      // Deep exploration (protected signal) should be kept
      expect(result.selectedItemIds).toContain(1);
      expect(result.droppedItems).toHaveLength(0);
    });
  });

  describe("P5: protected signals preservation", () => {
    it("never drops items with cross-service signal even under budget pressure", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "low",
          changedFilePaths: ["src/gateway.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["error-path"],
            reviewComments: [],
            riskSignals: ["cross-service"],
          },
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [],
        budgetMinutes: 5, // Very tight
      });

      expect(result.selectedItemIds).toContain(1);
    });

    it("never drops items with async signal", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "low",
          changedFilePaths: ["src/worker.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["error-path"],
            reviewComments: [],
            riskSignals: ["async"],
          },
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [],
        budgetMinutes: 5,
      });

      expect(result.selectedItemIds).toContain(1);
    });

    it("never drops items with state-transition signal", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "low",
          changedFilePaths: ["src/state.ts"],
          sourceSignals: {
            categories: [],
            existingTestLayers: [],
            gapAspects: ["state-transition"],
            reviewComments: [],
            riskSignals: ["state-transition"],
          },
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [],
        budgetMinutes: 5,
      });

      expect(result.selectedItemIds).toContain(1);
    });
  });

  describe("estimatedMinutes resolution", () => {
    it("uses theme estimatedMinutes when available", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "medium",
          changedFilePaths: ["src/a.ts"],
        }),
      ];

      const themes = [
        makeTheme({
          title: "A",
          targetFiles: ["src/a.ts"],
          estimatedMinutes: 45,
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes,
        budgetMinutes: 120,
      });

      expect(result.budgetUsedMinutes).toBe(45);
    });

    it("uses first matching theme for per-item pricing", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "medium",
          changedFilePaths: ["src/a.ts"],
        }),
      ];

      // Two themes target src/a.ts but first-match pricing uses 15 (not sum)
      const themes = [
        makeTheme({
          title: "Theme1",
          targetFiles: ["src/a.ts"],
          estimatedMinutes: 15,
        }),
        makeTheme({
          title: "Theme2",
          targetFiles: ["src/a.ts"],
          estimatedMinutes: 25,
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes,
        budgetMinutes: 120,
      });

      // Item-level pruning uses first-match (15). Post-pruning charter
      // validation in generate-charters handles actual fan-out.
      expect(result.budgetUsedMinutes).toBe(15);
    });

    it("falls back to default minutes by risk level when no theme matches", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "high",
          changedFilePaths: ["src/a.ts"],
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [], // No matching themes
        budgetMinutes: 120,
      });

      // high risk default = 30
      expect(result.budgetUsedMinutes).toBe(30);
    });
  });

  describe("edge cases", () => {
    it("returns empty result for empty input", () => {
      const result = pruneManualExplorationItems({
        manualItems: [],
        devBoxItems: [],
        themes: [],
        budgetMinutes: 120,
      });

      expect(result.selectedItemIds).toHaveLength(0);
      expect(result.droppedItems).toHaveLength(0);
      expect(result.totalEstimatedMinutes).toBe(0);
      expect(result.budgetUsedMinutes).toBe(0);
    });

    it("keeps all items when everything fits in budget", () => {
      const items = [
        makeManualItem({
          id: 1,
          riskLevel: "low",
          changedFilePaths: ["src/a.ts"],
        }),
        makeManualItem({
          id: 2,
          riskLevel: "medium",
          changedFilePaths: ["src/b.ts"],
        }),
      ];

      const result = pruneManualExplorationItems({
        manualItems: items,
        devBoxItems: [],
        themes: [],
        budgetMinutes: 120, // Default: low=10 + medium=20 = 30 < 120
      });

      expect(result.selectedItemIds).toHaveLength(2);
      expect(result.droppedItems).toHaveLength(0);
    });
  });
});
