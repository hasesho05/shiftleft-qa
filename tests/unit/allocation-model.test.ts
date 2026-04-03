import { describe, expect, it } from "vitest";

import {
  allocationDestinationSchema,
  allocationItemSchema,
  allocationSourceSignalsSchema,
  createEmptyAllocationDestinationCounts,
} from "../../src/exploratory-testing/models/allocation";

describe("allocationDestinationSchema", () => {
  it("accepts the supported destinations", () => {
    const destinations = [
      "review",
      "unit",
      "integration",
      "e2e",
      "visual",
      "dev-box",
      "manual-exploration",
      "skip",
    ] as const;

    for (const destination of destinations) {
      expect(allocationDestinationSchema.parse(destination)).toBe(destination);
    }
  });

  it("rejects unsupported destinations", () => {
    expect(() => allocationDestinationSchema.parse("automation")).toThrow();
  });
});

describe("allocationSourceSignalsSchema", () => {
  it("parses structured source signals", () => {
    const result = allocationSourceSignalsSchema.parse({
      categories: ["permission", "ui"],
      existingTestLayers: ["unit", "visual"],
      gapAspects: ["permission", "happy-path"],
      reviewComments: ["Please review auth guard"],
      riskSignals: ["permission", "ui"],
    });

    expect(result.categories).toEqual(["permission", "ui"]);
    expect(result.existingTestLayers).toEqual(["unit", "visual"]);
    expect(result.gapAspects).toEqual(["permission", "happy-path"]);
  });
});

describe("allocationItemSchema", () => {
  it("parses a valid allocation item", () => {
    const result = allocationItemSchema.parse({
      riskAssessmentId: 1,
      title: "Review permission guard in src/middleware/auth.ts",
      changedFilePaths: ["src/middleware/auth.ts"],
      riskLevel: "high",
      recommendedDestination: "review",
      confidence: 0.9,
      rationale: "Permission changes should be reviewed before QA handoff",
      sourceSignals: {
        categories: ["permission"],
        existingTestLayers: [],
        gapAspects: ["permission"],
        reviewComments: ["Needs auth guard review"],
        riskSignals: ["permission"],
      },
    });

    expect(result.riskAssessmentId).toBe(1);
    expect(result.recommendedDestination).toBe("review");
  });

  it("rejects empty changedFilePaths", () => {
    expect(() =>
      allocationItemSchema.parse({
        riskAssessmentId: 1,
        title: "Broken",
        changedFilePaths: [],
        riskLevel: "low",
        recommendedDestination: "skip",
        confidence: 0.5,
        rationale: "No files",
        sourceSignals: {
          categories: [],
          existingTestLayers: [],
          gapAspects: [],
          reviewComments: [],
          riskSignals: [],
        },
      }),
    ).toThrow();
  });
});

describe("createEmptyAllocationDestinationCounts", () => {
  it("initializes all destinations to zero", () => {
    expect(createEmptyAllocationDestinationCounts()).toEqual({
      review: 0,
      unit: 0,
      integration: 0,
      e2e: 0,
      visual: 0,
      "dev-box": 0,
      "manual-exploration": 0,
      skip: 0,
    });
  });
});
