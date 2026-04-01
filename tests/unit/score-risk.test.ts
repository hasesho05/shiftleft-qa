import { describe, expect, it } from "vitest";

import { scoreRisks } from "../../src/exploratory-testing/analysis/score-risk";
import type { FileChangeAnalysis } from "../../src/exploratory-testing/models/change-analysis";
import type { CoverageGapEntry } from "../../src/exploratory-testing/models/test-mapping";

function makeFileAnalysis(
  overrides: Partial<FileChangeAnalysis> & { path: string },
): FileChangeAnalysis {
  return {
    status: "modified",
    additions: 10,
    deletions: 5,
    categories: [],
    ...overrides,
  };
}

function makeGapEntry(
  overrides: Partial<CoverageGapEntry> & { changedFilePath: string },
): CoverageGapEntry {
  return {
    aspect: "happy-path",
    status: "uncovered",
    coveredBy: [],
    explorationPriority: "high",
    ...overrides,
  };
}

describe("scoreRisks", () => {
  it("returns a risk score for each unique changed file", () => {
    const fileAnalyses: FileChangeAnalysis[] = [
      makeFileAnalysis({ path: "src/a.ts" }),
      makeFileAnalysis({ path: "src/b.ts" }),
    ];
    const gaps: CoverageGapEntry[] = [];

    const scores = scoreRisks(fileAnalyses, gaps);
    expect(scores).toHaveLength(2);
    expect(scores.map((s) => s.changedFilePath)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  it("assigns higher risk when more aspects are uncovered", () => {
    const fileAnalyses: FileChangeAnalysis[] = [
      makeFileAnalysis({ path: "src/risky.ts" }),
      makeFileAnalysis({ path: "src/safe.ts" }),
    ];
    const gaps: CoverageGapEntry[] = [
      makeGapEntry({
        changedFilePath: "src/risky.ts",
        aspect: "happy-path",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/risky.ts",
        aspect: "error-path",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/risky.ts",
        aspect: "boundary",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/safe.ts",
        aspect: "happy-path",
        status: "covered",
      }),
      makeGapEntry({
        changedFilePath: "src/safe.ts",
        aspect: "error-path",
        status: "covered",
      }),
      makeGapEntry({
        changedFilePath: "src/safe.ts",
        aspect: "boundary",
        status: "covered",
      }),
    ];

    const scores = scoreRisks(fileAnalyses, gaps);
    const risky = scores.find((s) => s.changedFilePath === "src/risky.ts");
    const safe = scores.find((s) => s.changedFilePath === "src/safe.ts");

    expect(risky).toBeDefined();
    expect(safe).toBeDefined();
    expect(risky?.overallRisk).toBeGreaterThan(safe?.overallRisk ?? 0);
  });

  it("assigns higher risk to files with more change lines", () => {
    const fileAnalyses: FileChangeAnalysis[] = [
      makeFileAnalysis({ path: "src/big.ts", additions: 200, deletions: 100 }),
      makeFileAnalysis({ path: "src/small.ts", additions: 2, deletions: 1 }),
    ];
    const gaps: CoverageGapEntry[] = [];

    const scores = scoreRisks(fileAnalyses, gaps);
    const big = scores.find((s) => s.changedFilePath === "src/big.ts");
    const small = scores.find((s) => s.changedFilePath === "src/small.ts");

    expect(big?.overallRisk).toBeGreaterThan(small?.overallRisk ?? 0);
  });

  it("considers high-risk categories as a risk factor", () => {
    const fileAnalyses: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/auth.ts",
        categories: [
          { category: "permission", confidence: 0.9, reason: "Auth module" },
        ],
      }),
      makeFileAnalysis({
        path: "src/style.css",
        additions: 10,
        deletions: 5,
        categories: [{ category: "ui", confidence: 0.9, reason: "Stylesheet" }],
      }),
    ];
    const gaps: CoverageGapEntry[] = [];

    const scores = scoreRisks(fileAnalyses, gaps);
    const auth = scores.find((s) => s.changedFilePath === "src/auth.ts");
    const style = scores.find((s) => s.changedFilePath === "src/style.css");

    expect(auth?.overallRisk).toBeGreaterThan(style?.overallRisk ?? 0);
  });

  it("clamps overallRisk to the 0-1 range", () => {
    const fileAnalyses: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/extreme.ts",
        additions: 10000,
        deletions: 5000,
        categories: [
          { category: "permission", confidence: 1.0, reason: "Auth" },
          { category: "cross-service", confidence: 1.0, reason: "Cross svc" },
          { category: "async", confidence: 1.0, reason: "Async" },
        ],
      }),
    ];
    const gaps: CoverageGapEntry[] = [
      makeGapEntry({
        changedFilePath: "src/extreme.ts",
        aspect: "happy-path",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/extreme.ts",
        aspect: "error-path",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/extreme.ts",
        aspect: "boundary",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/extreme.ts",
        aspect: "permission",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/extreme.ts",
        aspect: "state-transition",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/extreme.ts",
        aspect: "mock-fixture",
        status: "uncovered",
      }),
    ];

    const scores = scoreRisks(fileAnalyses, gaps);
    expect(scores[0].overallRisk).toBeLessThanOrEqual(1);
    expect(scores[0].overallRisk).toBeGreaterThanOrEqual(0);
  });

  it("includes named factors in each risk score", () => {
    const fileAnalyses: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/app.ts",
        additions: 50,
        deletions: 20,
        categories: [
          { category: "api", confidence: 0.8, reason: "API endpoint" },
        ],
      }),
    ];
    const gaps: CoverageGapEntry[] = [
      makeGapEntry({
        changedFilePath: "src/app.ts",
        aspect: "error-path",
        status: "uncovered",
      }),
    ];

    const scores = scoreRisks(fileAnalyses, gaps);
    const factors = scores[0].factors.map((f) => f.factor);
    expect(factors).toContain("uncovered-aspects");
    expect(factors).toContain("change-magnitude");
    expect(factors).toContain("category-risk");
  });

  it("returns empty array for empty inputs", () => {
    expect(scoreRisks([], [])).toEqual([]);
  });
});
