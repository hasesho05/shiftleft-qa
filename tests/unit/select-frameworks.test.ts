import { describe, expect, it } from "vitest";

import { selectFrameworks } from "../../src/exploratory-testing/analysis/select-frameworks";
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

describe("selectFrameworks", () => {
  it("selects boundary-value-analysis for validation changes", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/validators/amount.ts",
        categories: [
          {
            category: "validation",
            confidence: 0.9,
            reason: "Validation module",
          },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    const frameworks = selections.map((s) => s.framework);
    expect(frameworks).toContain("boundary-value-analysis");
  });

  it("selects state-transition for state management changes", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/store/auth.ts",
        categories: [
          {
            category: "state-transition",
            confidence: 0.85,
            reason: "State mgmt",
          },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    const frameworks = selections.map((s) => s.framework);
    expect(frameworks).toContain("state-transition");
  });

  it("selects error-guessing for permission/async changes", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/auth/rbac.ts",
        categories: [
          { category: "permission", confidence: 0.9, reason: "RBAC" },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    const frameworks = selections.map((s) => s.framework);
    expect(frameworks).toContain("error-guessing");
  });

  it("selects equivalence-partitioning for API changes with uncovered aspects", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/routes/users.ts",
        categories: [{ category: "api", confidence: 0.8, reason: "API route" }],
      }),
    ];
    const gaps: CoverageGapEntry[] = [
      makeGapEntry({
        changedFilePath: "src/routes/users.ts",
        aspect: "happy-path",
        status: "uncovered",
      }),
    ];

    const selections = selectFrameworks(files, gaps);
    const frameworks = selections.map((s) => s.framework);
    expect(frameworks).toContain("equivalence-partitioning");
  });

  it("selects decision-table when multiple categories co-exist", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/payment/process.ts",
        categories: [
          { category: "permission", confidence: 0.8, reason: "Auth check" },
          {
            category: "validation",
            confidence: 0.7,
            reason: "Input validation",
          },
          { category: "api", confidence: 0.6, reason: "API endpoint" },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    const frameworks = selections.map((s) => s.framework);
    expect(frameworks).toContain("decision-table");
  });

  it("selects pairwise for feature-flag changes", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/features/flags.ts",
        categories: [
          { category: "feature-flag", confidence: 0.9, reason: "Feature flag" },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    const frameworks = selections.map((s) => s.framework);
    expect(frameworks).toContain("pairwise");
  });

  it("does not select all 8 frameworks for a single category", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/ui/button.tsx",
        categories: [
          { category: "ui", confidence: 0.8, reason: "React component" },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    expect(selections.length).toBeLessThan(8);
    expect(selections.length).toBeGreaterThan(0);
  });

  it("includes reason and relevantFiles for each selection", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/store/cart.ts",
        categories: [
          {
            category: "state-transition",
            confidence: 0.85,
            reason: "State store",
          },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    for (const selection of selections) {
      expect(selection.reason.length).toBeGreaterThan(0);
      expect(selection.relevantFiles.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array for empty inputs", () => {
    expect(selectFrameworks([], [])).toEqual([]);
  });

  it("deduplicates frameworks across files", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/validators/a.ts",
        categories: [
          { category: "validation", confidence: 0.9, reason: "Validation" },
        ],
      }),
      makeFileAnalysis({
        path: "src/validators/b.ts",
        categories: [
          { category: "validation", confidence: 0.9, reason: "Validation" },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    const frameworks = selections.map((s) => s.framework);
    const uniqueFrameworks = [...new Set(frameworks)];
    expect(frameworks.length).toBe(uniqueFrameworks.length);
  });

  it("merges relevantFiles when same framework is triggered by multiple files", () => {
    const files: FileChangeAnalysis[] = [
      makeFileAnalysis({
        path: "src/validators/a.ts",
        categories: [
          { category: "validation", confidence: 0.9, reason: "Validation" },
        ],
      }),
      makeFileAnalysis({
        path: "src/validators/b.ts",
        categories: [
          { category: "validation", confidence: 0.9, reason: "Validation" },
        ],
      }),
    ];

    const selections = selectFrameworks(files, []);
    const bva = selections.find(
      (s) => s.framework === "boundary-value-analysis",
    );
    expect(bva).toBeDefined();
    expect(bva?.relevantFiles).toContain("src/validators/a.ts");
    expect(bva?.relevantFiles).toContain("src/validators/b.ts");
  });
});
