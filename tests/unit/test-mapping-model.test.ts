import { describe, expect, it } from "vitest";

import {
  coverageAspectSchema,
  coverageGapEntrySchema,
  testAssetSchema,
  testLayerSchema,
  testMappingResultSchema,
  testSummarySchema,
} from "../../src/exploratory-testing/models/test-mapping";

describe("testLayerSchema", () => {
  it("accepts valid test layers", () => {
    const layers = ["unit", "e2e", "visual", "storybook", "api"] as const;

    for (const layer of layers) {
      expect(testLayerSchema.parse(layer)).toBe(layer);
    }
  });

  it("rejects unknown test layers", () => {
    expect(() => testLayerSchema.parse("integration")).toThrow();
  });
});

describe("coverageAspectSchema", () => {
  it("accepts valid coverage aspects", () => {
    const aspects = [
      "happy-path",
      "error-path",
      "boundary",
      "permission",
      "state-transition",
      "mock-fixture",
    ] as const;

    for (const aspect of aspects) {
      expect(coverageAspectSchema.parse(aspect)).toBe(aspect);
    }
  });

  it("rejects unknown coverage aspects", () => {
    expect(() => coverageAspectSchema.parse("other")).toThrow();
  });
});

describe("testAssetSchema", () => {
  it("parses a valid test asset", () => {
    const input = {
      path: "tests/unit/auth.test.ts",
      layer: "unit",
      relatedTo: ["src/middleware/auth.ts"],
      confidence: 0.9,
    };

    const result = testAssetSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects missing path", () => {
    expect(() =>
      testAssetSchema.parse({
        layer: "unit",
        relatedTo: [],
        confidence: 0.5,
      }),
    ).toThrow();
  });

  it("rejects confidence out of range", () => {
    expect(() =>
      testAssetSchema.parse({
        path: "tests/foo.test.ts",
        layer: "unit",
        relatedTo: [],
        confidence: 1.5,
      }),
    ).toThrow();
  });
});

describe("testSummarySchema", () => {
  it("parses a valid test summary", () => {
    const input = {
      testAssetPath: "tests/unit/auth.test.ts",
      layer: "unit",
      coveredAspects: ["happy-path", "error-path"],
      description: "Tests login and logout flows",
    };

    const result = testSummarySchema.parse(input);
    expect(result).toEqual(input);
  });

  it("accepts empty coveredAspects", () => {
    const input = {
      testAssetPath: "tests/api/users.test.ts",
      layer: "api",
      coveredAspects: [],
      description: "API contract tests",
    };

    expect(testSummarySchema.parse(input)).toEqual(input);
  });
});

describe("coverageGapEntrySchema", () => {
  it("parses a covered entry", () => {
    const input = {
      changedFilePath: "src/middleware/auth.ts",
      aspect: "happy-path",
      status: "covered",
      coveredBy: ["tests/unit/auth.test.ts"],
      explorationPriority: "low",
    };

    const result = coverageGapEntrySchema.parse(input);
    expect(result).toEqual(input);
  });

  it("parses an uncovered entry", () => {
    const input = {
      changedFilePath: "src/middleware/auth.ts",
      aspect: "permission",
      status: "uncovered",
      coveredBy: [],
      explorationPriority: "high",
    };

    expect(coverageGapEntrySchema.parse(input)).toEqual(input);
  });

  it("parses a partial entry", () => {
    const input = {
      changedFilePath: "src/api/users.ts",
      aspect: "error-path",
      status: "partial",
      coveredBy: ["tests/unit/users.test.ts"],
      explorationPriority: "medium",
    };

    expect(coverageGapEntrySchema.parse(input)).toEqual(input);
  });
});

describe("testMappingResultSchema", () => {
  it("parses a full test mapping result", () => {
    const input = {
      prIntakeId: 1,
      changeAnalysisId: 1,
      testAssets: [
        {
          path: "tests/unit/auth.test.ts",
          layer: "unit",
          relatedTo: ["src/middleware/auth.ts"],
          confidence: 0.9,
        },
      ],
      testSummaries: [
        {
          testAssetPath: "tests/unit/auth.test.ts",
          layer: "unit",
          coveredAspects: ["happy-path"],
          description: "Tests login flow",
        },
      ],
      coverageGapMap: [
        {
          changedFilePath: "src/middleware/auth.ts",
          aspect: "happy-path",
          status: "covered",
          coveredBy: ["tests/unit/auth.test.ts"],
          explorationPriority: "low",
        },
      ],
      missingLayers: ["e2e", "visual"],
      mappedAt: "2026-04-01T00:00:00Z",
    };

    const result = testMappingResultSchema.parse(input);
    expect(result.prIntakeId).toBe(1);
    expect(result.testAssets).toHaveLength(1);
    expect(result.coverageGapMap).toHaveLength(1);
    expect(result.missingLayers).toEqual(["e2e", "visual"]);
  });

  it("rejects missing required fields", () => {
    expect(() =>
      testMappingResultSchema.parse({
        prIntakeId: 1,
      }),
    ).toThrow();
  });
});
