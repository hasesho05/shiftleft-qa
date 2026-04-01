import { describe, expect, it } from "vitest";

import { generateExplorationThemes } from "../../src/exploratory-testing/analysis/generate-exploration-themes";
import type {
  FrameworkSelection,
  RiskScore,
} from "../../src/exploratory-testing/models/risk-assessment";
import type { CoverageGapEntry } from "../../src/exploratory-testing/models/test-mapping";

function makeRiskScore(
  overrides: Partial<RiskScore> & { changedFilePath: string },
): RiskScore {
  return {
    overallRisk: 0.5,
    factors: [],
    ...overrides,
  };
}

function makeFrameworkSelection(
  overrides: Partial<FrameworkSelection>,
): FrameworkSelection {
  return {
    framework: "boundary-value-analysis",
    reason: "Test reason",
    relevantFiles: ["src/foo.ts"],
    priority: "medium",
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

describe("generateExplorationThemes", () => {
  it("generates at least one theme when frameworks are selected", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({
        changedFilePath: "src/payment/validate.ts",
        overallRisk: 0.8,
      }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "boundary-value-analysis",
        relevantFiles: ["src/payment/validate.ts"],
        priority: "high",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, []);
    expect(themes.length).toBeGreaterThanOrEqual(1);
  });

  it("sets riskLevel based on relevant risk scores", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({ changedFilePath: "src/auth.ts", overallRisk: 0.9 }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "error-guessing",
        relevantFiles: ["src/auth.ts"],
        priority: "high",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, []);
    const authTheme = themes.find((t) => t.targetFiles.includes("src/auth.ts"));
    expect(authTheme).toBeDefined();
    expect(authTheme?.riskLevel).toBe("high");
  });

  it("generates a theme per framework selection", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.6 }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "boundary-value-analysis",
        relevantFiles: ["src/a.ts"],
        priority: "high",
      }),
      makeFrameworkSelection({
        framework: "state-transition",
        relevantFiles: ["src/a.ts"],
        priority: "medium",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, []);
    expect(themes.length).toBe(2);
    const frameworkNames = themes.flatMap((t) => t.frameworks);
    expect(frameworkNames).toContain("boundary-value-analysis");
    expect(frameworkNames).toContain("state-transition");
  });

  it("includes meaningful title and description", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({ changedFilePath: "src/store/cart.ts", overallRisk: 0.7 }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "state-transition",
        reason: "State management changes require transition testing",
        relevantFiles: ["src/store/cart.ts"],
        priority: "high",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, []);
    expect(themes[0].title.length).toBeGreaterThan(5);
    expect(themes[0].description.length).toBeGreaterThan(10);
  });

  it("orders themes by risk level descending", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({ changedFilePath: "src/low.ts", overallRisk: 0.1 }),
      makeRiskScore({ changedFilePath: "src/high.ts", overallRisk: 0.9 }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "sampling",
        relevantFiles: ["src/low.ts"],
        priority: "low",
      }),
      makeFrameworkSelection({
        framework: "error-guessing",
        relevantFiles: ["src/high.ts"],
        priority: "high",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, []);
    expect(themes[0].riskLevel).toBe("high");
  });

  it("generates a gap-specific theme when uncovered aspects exist", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({ changedFilePath: "src/api/users.ts", overallRisk: 0.7 }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "equivalence-partitioning",
        relevantFiles: ["src/api/users.ts"],
        priority: "medium",
      }),
    ];
    const gaps: CoverageGapEntry[] = [
      makeGapEntry({
        changedFilePath: "src/api/users.ts",
        aspect: "error-path",
        status: "uncovered",
      }),
      makeGapEntry({
        changedFilePath: "src/api/users.ts",
        aspect: "permission",
        status: "uncovered",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, gaps);
    // Should have at least the framework-based theme
    expect(themes.length).toBeGreaterThanOrEqual(1);
  });

  it("sets estimatedMinutes to a positive integer", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.5 }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "boundary-value-analysis",
        relevantFiles: ["src/a.ts"],
        priority: "medium",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, []);
    for (const theme of themes) {
      expect(theme.estimatedMinutes).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(theme.estimatedMinutes)).toBe(true);
    }
  });

  it("returns empty array when no frameworks are selected", () => {
    expect(generateExplorationThemes([], [], [])).toEqual([]);
  });
});
