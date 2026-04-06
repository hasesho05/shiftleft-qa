import { describe, expect, it } from "vitest";

import { groupAllocationItems } from "../../src/exploratory-testing/analysis/group-allocation-items";
import type { PersistedAllocationItem } from "../../src/exploratory-testing/db/workspace-repository";

function makeItem(
  overrides: Partial<PersistedAllocationItem> & {
    readonly changedFilePaths: readonly string[];
    readonly recommendedDestination: PersistedAllocationItem["recommendedDestination"];
  },
): PersistedAllocationItem {
  return {
    id: overrides.id ?? 1,
    riskAssessmentId: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    title: overrides.title ?? `Item for ${overrides.changedFilePaths[0]}`,
    changedFilePaths: overrides.changedFilePaths,
    riskLevel: overrides.riskLevel ?? "medium",
    recommendedDestination: overrides.recommendedDestination,
    confidence: overrides.confidence ?? 0.6,
    rationale: overrides.rationale ?? "test rationale",
    sourceSignals: overrides.sourceSignals ?? {
      categories: [],
      existingTestLayers: [],
      gapAspects: ["happy-path"],
      reviewComments: [],
      riskSignals: [],
    },
  };
}

describe("groupAllocationItems", () => {
  it("groups same-file same-destination items into one group", () => {
    const items = [
      makeItem({
        changedFilePaths: ["src/auth.ts"],
        recommendedDestination: "unit",
        sourceSignals: {
          categories: ["validation"],
          existingTestLayers: [],
          gapAspects: ["happy-path"],
          reviewComments: [],
          riskSignals: [],
        },
      }),
      makeItem({
        changedFilePaths: ["src/auth.ts"],
        recommendedDestination: "unit",
        sourceSignals: {
          categories: ["validation"],
          existingTestLayers: [],
          gapAspects: ["error-path"],
          reviewComments: [],
          riskSignals: [],
        },
      }),
    ];

    const groups = groupAllocationItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].combinedAspects).toContain("happy-path");
    expect(groups[0].combinedAspects).toContain("error-path");
    expect(groups[0].destination).toBe("unit");
  });

  it("keeps different-destination items in separate groups", () => {
    const items = [
      makeItem({
        changedFilePaths: ["src/auth.ts"],
        recommendedDestination: "unit",
      }),
      makeItem({
        changedFilePaths: ["src/auth.ts"],
        recommendedDestination: "integration",
      }),
    ];

    const groups = groupAllocationItems(items);
    expect(groups).toHaveLength(2);
  });

  it("groups manual-exploration items by directory prefix", () => {
    const items = [
      makeItem({
        changedFilePaths: ["src/middleware/auth.ts"],
        recommendedDestination: "manual-exploration",
      }),
      makeItem({
        changedFilePaths: ["src/middleware/cors.ts"],
        recommendedDestination: "manual-exploration",
      }),
    ];

    const groups = groupAllocationItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].changedFilePaths).toContain("src/middleware/auth.ts");
    expect(groups[0].changedFilePaths).toContain("src/middleware/cors.ts");
  });

  it("takes max risk level and min confidence across group", () => {
    const items = [
      makeItem({
        changedFilePaths: ["src/api/handler.ts"],
        recommendedDestination: "unit",
        riskLevel: "high",
        confidence: 0.8,
      }),
      makeItem({
        changedFilePaths: ["src/api/handler.ts"],
        recommendedDestination: "unit",
        riskLevel: "low",
        confidence: 0.4,
      }),
    ];

    const groups = groupAllocationItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].riskLevel).toBe("high");
    expect(groups[0].confidence).toBe(0.4);
  });

  it("returns empty array for empty input", () => {
    expect(groupAllocationItems([])).toEqual([]);
  });
});
