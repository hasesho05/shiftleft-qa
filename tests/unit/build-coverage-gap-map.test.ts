import { describe, expect, it } from "vitest";

import {
  buildCoverageGapMap,
  detectMissingLayers,
} from "../../src/exploratory-testing/analysis/build-coverage-gap-map";
import type { FileChangeAnalysis } from "../../src/exploratory-testing/models/change-analysis";
import type {
  CoverageGapEntry,
  TestAsset,
  TestSummary,
} from "../../src/exploratory-testing/models/test-mapping";

function makeFileAnalysis(
  path: string,
  categories: FileChangeAnalysis["categories"] = [],
): FileChangeAnalysis {
  return {
    path,
    status: "modified",
    additions: 10,
    deletions: 2,
    categories,
  };
}

function makeTestAsset(
  path: string,
  layer: TestAsset["layer"],
  relatedTo: string[],
  stability: TestAsset["stability"] = "unknown",
  stabilitySignals: string[] = [],
): TestAsset {
  return {
    path,
    layer,
    relatedTo,
    confidence: 0.8,
    stability,
    stabilitySignals,
    stabilityNotes: [],
  };
}

function makeTestSummary(
  testAssetPath: string,
  layer: TestSummary["layer"],
  coveredAspects: TestSummary["coveredAspects"],
  coverageConfidence: TestSummary["coverageConfidence"] = "confirmed",
): TestSummary {
  return {
    testAssetPath,
    layer,
    coveredAspects,
    coverageConfidence,
    description: "test summary",
  };
}

describe("buildCoverageGapMap", () => {
  it("marks aspects as covered when test summaries cover them", () => {
    const fileAnalyses = [
      makeFileAnalysis("src/auth.ts", [
        { category: "permission", confidence: 0.9, reason: "auth" },
      ]),
    ];
    const testAssets = [
      makeTestAsset("tests/unit/auth.test.ts", "unit", ["src/auth.ts"]),
    ];
    const testSummaries = [
      makeTestSummary("tests/unit/auth.test.ts", "unit", [
        "happy-path",
        "error-path",
      ]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const happyPath = gaps.find(
      (g) => g.changedFilePath === "src/auth.ts" && g.aspect === "happy-path",
    );
    expect(happyPath?.status).toBe("covered");
    expect(happyPath?.coveredBy).toContain("tests/unit/auth.test.ts");
    expect(happyPath?.explorationPriority).toBe("low");
  });

  it("marks aspects as uncovered when no test covers them", () => {
    const fileAnalyses = [
      makeFileAnalysis("src/auth.ts", [
        { category: "permission", confidence: 0.9, reason: "auth" },
      ]),
    ];
    const testAssets = [
      makeTestAsset("tests/unit/auth.test.ts", "unit", ["src/auth.ts"]),
    ];
    const testSummaries = [
      makeTestSummary("tests/unit/auth.test.ts", "unit", ["happy-path"]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const permission = gaps.find(
      (g) => g.changedFilePath === "src/auth.ts" && g.aspect === "permission",
    );
    expect(permission?.status).toBe("uncovered");
    expect(permission?.explorationPriority).toBe("high");
  });

  it("marks inferred coverage as partial", () => {
    const fileAnalyses = [
      makeFileAnalysis("src/api/users.ts", [
        { category: "api", confidence: 0.8, reason: "API route" },
      ]),
    ];
    const testAssets = [
      makeTestAsset("tests/api/users.test.ts", "api", ["src/api/users.ts"]),
    ];
    const testSummaries = [
      makeTestSummary(
        "tests/api/users.test.ts",
        "api",
        ["happy-path", "error-path", "boundary"],
        "inferred",
      ),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);
    const boundary = gaps.find(
      (gap) =>
        gap.changedFilePath === "src/api/users.ts" && gap.aspect === "boundary",
    );

    expect(boundary?.status).toBe("partial");
    expect(boundary?.explorationPriority).toBe("medium");
  });

  it("uses baseline aspects only for uncategorized files", () => {
    const fileAnalyses = [makeFileAnalysis("src/foo.ts")];
    const gaps = buildCoverageGapMap(fileAnalyses, [], []);

    const fooGaps = gaps.filter((g) => g.changedFilePath === "src/foo.ts");
    expect(fooGaps).toHaveLength(2);

    const aspects = fooGaps.map((g) => g.aspect).sort();
    expect(aspects).toEqual(["error-path", "happy-path"]);
  });

  it("reduces irrelevant aspects for categorized files", () => {
    const fileAnalyses = [
      makeFileAnalysis("src/auth.ts", [
        { category: "permission", confidence: 0.9, reason: "auth" },
      ]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, [], []);
    const aspects = gaps
      .filter((gap) => gap.changedFilePath === "src/auth.ts")
      .map((gap) => gap.aspect)
      .sort();

    expect(aspects).toEqual(["error-path", "happy-path", "permission"]);
  });

  it("sets all uncovered gaps to high priority when no tests exist", () => {
    const fileAnalyses = [makeFileAnalysis("src/no-test.ts")];
    const gaps = buildCoverageGapMap(fileAnalyses, [], []);

    for (const gap of gaps) {
      expect(gap.status).toBe("uncovered");
      expect(gap.explorationPriority).toBe("high");
    }
  });

  it("downgrades covered to partial when covering test is flaky", () => {
    const fileAnalyses = [makeFileAnalysis("src/auth.ts")];
    const testAssets = [
      makeTestAsset(
        "tests/unit/auth.test.ts",
        "unit",
        ["src/auth.ts"],
        "flaky",
        ["path:flaky"],
      ),
    ];
    const testSummaries = [
      makeTestSummary("tests/unit/auth.test.ts", "unit", [
        "happy-path",
        "error-path",
      ]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const happyPath = gaps.find(
      (g) => g.changedFilePath === "src/auth.ts" && g.aspect === "happy-path",
    );
    expect(happyPath?.status).toBe("partial");
    expect(happyPath?.stabilityNotes).toBeDefined();
    expect(happyPath?.stabilityNotes?.length).toBeGreaterThan(0);
  });

  it("adds stability notes when covering test is quarantined", () => {
    const fileAnalyses = [makeFileAnalysis("src/payment.ts")];
    const testAssets = [
      makeTestAsset(
        "tests/quarantine/payment.test.ts",
        "unit",
        ["src/payment.ts"],
        "quarantined",
        ["path:quarantine"],
      ),
    ];
    const testSummaries = [
      makeTestSummary("tests/quarantine/payment.test.ts", "unit", [
        "happy-path",
      ]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const happyPath = gaps.find(
      (g) =>
        g.changedFilePath === "src/payment.ts" && g.aspect === "happy-path",
    );
    expect(happyPath?.status).toBe("partial");
    expect(happyPath?.stabilityNotes).toBeDefined();
    expect(happyPath?.stabilityNotes?.length).toBeGreaterThan(0);
  });

  it("does not downgrade coverage for stable tests", () => {
    const fileAnalyses = [makeFileAnalysis("src/auth.ts")];
    const testAssets = [
      makeTestAsset(
        "tests/unit/auth.test.ts",
        "unit",
        ["src/auth.ts"],
        "stable",
      ),
    ];
    const testSummaries = [
      makeTestSummary("tests/unit/auth.test.ts", "unit", ["happy-path"]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const happyPath = gaps.find(
      (g) => g.changedFilePath === "src/auth.ts" && g.aspect === "happy-path",
    );
    expect(happyPath?.status).toBe("covered");
    expect(happyPath?.stabilityNotes ?? []).toHaveLength(0);
  });

  it("keeps covered when both stable and flaky confirmed tests exist", () => {
    const fileAnalyses = [makeFileAnalysis("src/auth.ts")];
    const testAssets = [
      makeTestAsset(
        "tests/unit/auth.test.ts",
        "unit",
        ["src/auth.ts"],
        "stable",
      ),
      makeTestAsset(
        "tests/e2e/flaky/auth.spec.ts",
        "e2e",
        ["src/auth.ts"],
        "flaky",
        ["path:flaky"],
      ),
    ];
    const testSummaries = [
      makeTestSummary("tests/unit/auth.test.ts", "unit", ["happy-path"]),
      makeTestSummary("tests/e2e/flaky/auth.spec.ts", "e2e", ["happy-path"]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const happyPath = gaps.find(
      (g) => g.changedFilePath === "src/auth.ts" && g.aspect === "happy-path",
    );
    expect(happyPath?.status).toBe("covered");
    expect(happyPath?.stabilityNotes?.length).toBeGreaterThan(0);
  });

  it("preserves unknown stability as-is (no downgrade)", () => {
    const fileAnalyses = [makeFileAnalysis("src/auth.ts")];
    const testAssets = [
      makeTestAsset(
        "tests/unit/auth.test.ts",
        "unit",
        ["src/auth.ts"],
        "unknown",
      ),
    ];
    const testSummaries = [
      makeTestSummary("tests/unit/auth.test.ts", "unit", ["happy-path"]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const happyPath = gaps.find(
      (g) => g.changedFilePath === "src/auth.ts" && g.aspect === "happy-path",
    );
    expect(happyPath?.status).toBe("covered");
  });

  it("handles multiple files with different coverage", () => {
    const fileAnalyses = [
      makeFileAnalysis("src/a.ts"),
      makeFileAnalysis("src/b.ts"),
    ];
    const testAssets = [
      makeTestAsset("tests/unit/a.test.ts", "unit", ["src/a.ts"]),
    ];
    const testSummaries = [
      makeTestSummary("tests/unit/a.test.ts", "unit", ["happy-path"]),
    ];

    const gaps = buildCoverageGapMap(fileAnalyses, testAssets, testSummaries);

    const aHappy = gaps.find(
      (g) => g.changedFilePath === "src/a.ts" && g.aspect === "happy-path",
    );
    expect(aHappy?.status).toBe("covered");

    const bHappy = gaps.find(
      (g) => g.changedFilePath === "src/b.ts" && g.aspect === "happy-path",
    );
    expect(bHappy?.status).toBe("uncovered");
  });
});

describe("detectMissingLayers", () => {
  it("returns all layers when no test assets exist", () => {
    const missing = detectMissingLayers([]);
    expect(missing).toEqual(["unit", "e2e", "visual", "storybook", "api"]);
  });

  it("excludes layers that have at least one test asset", () => {
    const testAssets = [
      makeTestAsset("tests/unit/foo.test.ts", "unit", ["src/foo.ts"]),
      makeTestAsset("tests/api/foo.test.ts", "api", ["src/api/foo.ts"]),
    ];

    const missing = detectMissingLayers(testAssets);

    expect(missing).not.toContain("unit");
    expect(missing).not.toContain("api");
    expect(missing).toContain("e2e");
    expect(missing).toContain("visual");
    expect(missing).toContain("storybook");
  });

  it("returns empty when all layers are covered", () => {
    const testAssets = [
      makeTestAsset("a.test.ts", "unit", []),
      makeTestAsset("a.spec.ts", "e2e", []),
      makeTestAsset("a.visual.ts", "visual", []),
      makeTestAsset("a.stories.tsx", "storybook", []),
      makeTestAsset("a.api.ts", "api", []),
    ];

    const missing = detectMissingLayers(testAssets);
    expect(missing).toEqual([]);
  });
});
