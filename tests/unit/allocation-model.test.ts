import { describe, expect, it } from "vitest";

import {
  allocationDestinationSchema,
  allocationItemSchema,
  allocationSourceSignalsSchema,
  createEmptyAllocationDestinationCounts,
  toConfidenceBucket,
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

  it("accepts optional explanation fields", () => {
    const result = allocationSourceSignalsSchema.parse({
      categories: ["permission"],
      existingTestLayers: [],
      gapAspects: ["permission"],
      reviewComments: [],
      riskSignals: ["permission"],
      reasoningSummary:
        "Permission category triggers review destination; auth guard changes require human verification.",
      alternativeDestinations: ["unit", "manual-exploration"],
      openQuestions: ["Does the guard cover all admin endpoints?"],
    });

    expect(result.reasoningSummary).toBe(
      "Permission category triggers review destination; auth guard changes require human verification.",
    );
    expect(result.alternativeDestinations).toEqual([
      "unit",
      "manual-exploration",
    ]);
    expect(result.openQuestions).toEqual([
      "Does the guard cover all admin endpoints?",
    ]);
    expect(result.manualRemainder).toBeUndefined();
  });

  it("accepts manualRemainder for manual-exploration items", () => {
    const result = allocationSourceSignalsSchema.parse({
      categories: [],
      existingTestLayers: [],
      gapAspects: ["error-path"],
      reviewComments: [],
      riskSignals: ["timing"],
      manualRemainder:
        "Stateful error recovery cannot be pinned by deterministic tests.",
    });

    expect(result.manualRemainder).toBe(
      "Stateful error recovery cannot be pinned by deterministic tests.",
    );
  });

  it("parses without optional explanation fields (backward compat)", () => {
    const result = allocationSourceSignalsSchema.parse({
      categories: ["ui"],
      existingTestLayers: ["visual"],
      gapAspects: ["happy-path"],
      reviewComments: [],
      riskSignals: [],
    });

    expect(result.reasoningSummary).toBeUndefined();
    expect(result.alternativeDestinations).toBeUndefined();
    expect(result.openQuestions).toBeUndefined();
    expect(result.manualRemainder).toBeUndefined();
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

describe("toConfidenceBucket", () => {
  it("returns high for confidence >= 0.8", () => {
    expect(toConfidenceBucket(0.8)).toBe("high");
    expect(toConfidenceBucket(0.86)).toBe("high");
    expect(toConfidenceBucket(0.95)).toBe("high");
    expect(toConfidenceBucket(1.0)).toBe("high");
  });

  it("returns medium for confidence >= 0.5 and < 0.8", () => {
    expect(toConfidenceBucket(0.5)).toBe("medium");
    expect(toConfidenceBucket(0.55)).toBe("medium");
    expect(toConfidenceBucket(0.6)).toBe("medium");
    expect(toConfidenceBucket(0.75)).toBe("medium");
    expect(toConfidenceBucket(0.79)).toBe("medium");
  });

  it("returns low for confidence < 0.5", () => {
    expect(toConfidenceBucket(0.0)).toBe("low");
    expect(toConfidenceBucket(0.35)).toBe("low");
    expect(toConfidenceBucket(0.49)).toBe("low");
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
