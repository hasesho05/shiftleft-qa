import { describe, expect, it } from "vitest";

import { generateExplorationThemes } from "../../src/exploratory-testing/analysis/generate-exploration-themes";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";
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
    expect(themes.length).toBeGreaterThanOrEqual(2);
    expect(themes.some((theme) => theme.title.includes("error handling"))).toBe(
      true,
    );
    expect(
      themes.some((theme) => theme.title.includes("permission differences")),
    ).toBe(true);
  });

  it("uses related framework selections for gap-focused themes", () => {
    const riskScores: RiskScore[] = [
      makeRiskScore({ changedFilePath: "src/store/cart.ts", overallRisk: 0.9 }),
    ];
    const selections: FrameworkSelection[] = [
      makeFrameworkSelection({
        framework: "state-transition",
        relevantFiles: ["src/store/cart.ts"],
        priority: "high",
      }),
    ];
    const gaps: CoverageGapEntry[] = [
      makeGapEntry({
        changedFilePath: "src/store/cart.ts",
        aspect: "state-transition",
        status: "uncovered",
      }),
    ];

    const themes = generateExplorationThemes(riskScores, selections, gaps);
    const gapTheme = themes.find((theme) =>
      theme.title.includes("state transitions"),
    );

    expect(gapTheme).toBeDefined();
    expect(gapTheme?.frameworks).toContain("state-transition");
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

  describe("with intent context", () => {
    function makeIntent(overrides: Partial<IntentContext> = {}): IntentContext {
      return {
        changePurpose: null,
        userStory: null,
        acceptanceCriteria: [],
        nonGoals: [],
        targetUsers: [],
        notesForQa: [],
        sourceRefs: [],
        extractionStatus: "empty",
        ...overrides,
      };
    }

    it("enriches theme description with user story when provided", () => {
      const riskScores: RiskScore[] = [
        makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.6 }),
      ];
      const selections: FrameworkSelection[] = [
        makeFrameworkSelection({
          framework: "boundary-value-analysis",
          reason: "Validation changes",
          relevantFiles: ["src/a.ts"],
          priority: "medium",
        }),
      ];
      const intent = makeIntent({
        userStory: "As an admin, I can export reports",
        extractionStatus: "parsed",
      });

      const themes = generateExplorationThemes(
        riskScores,
        selections,
        [],
        intent,
      );

      expect(themes[0].description).toContain("export reports");
    });

    it("enriches theme description with acceptance criteria", () => {
      const riskScores: RiskScore[] = [
        makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.6 }),
      ];
      const selections: FrameworkSelection[] = [
        makeFrameworkSelection({
          framework: "boundary-value-analysis",
          relevantFiles: ["src/a.ts"],
          priority: "medium",
        }),
      ];
      const intent = makeIntent({
        acceptanceCriteria: ["CSV contains all columns"],
        extractionStatus: "parsed",
      });

      const themes = generateExplorationThemes(
        riskScores,
        selections,
        [],
        intent,
      );

      expect(themes[0].description).toContain("CSV contains all columns");
    });

    it("preserves original description when intent context is empty", () => {
      const riskScores: RiskScore[] = [
        makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.6 }),
      ];
      const selections: FrameworkSelection[] = [
        makeFrameworkSelection({
          framework: "boundary-value-analysis",
          reason: "Validation changes",
          relevantFiles: ["src/a.ts"],
          priority: "medium",
        }),
      ];

      const withoutIntent = generateExplorationThemes(
        riskScores,
        selections,
        [],
      );
      const withEmptyIntent = generateExplorationThemes(
        riskScores,
        selections,
        [],
        makeIntent(),
      );

      expect(withoutIntent[0].description).toBe(withEmptyIntent[0].description);
    });

    it("does not enrich when extractionStatus is empty", () => {
      const riskScores: RiskScore[] = [
        makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.6 }),
      ];
      const selections: FrameworkSelection[] = [
        makeFrameworkSelection({
          framework: "boundary-value-analysis",
          reason: "Original reason",
          relevantFiles: ["src/a.ts"],
          priority: "medium",
        }),
      ];
      const intent = makeIntent({
        userStory: "Should be ignored because status is empty",
        extractionStatus: "empty",
      });

      const themes = generateExplorationThemes(
        riskScores,
        selections,
        [],
        intent,
      );

      expect(themes[0].description).not.toContain("Should be ignored");
    });

    it("adds changePurpose=bugfix annotation to descriptions", () => {
      const riskScores: RiskScore[] = [
        makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.6 }),
      ];
      const selections: FrameworkSelection[] = [
        makeFrameworkSelection({
          framework: "error-guessing",
          relevantFiles: ["src/a.ts"],
          priority: "medium",
        }),
      ];
      const intent = makeIntent({
        changePurpose: "bugfix",
        extractionStatus: "parsed",
      });

      const themes = generateExplorationThemes(
        riskScores,
        selections,
        [],
        intent,
      );

      expect(themes[0].description).toMatch(/bugfix|regression/i);
    });

    it("does not produce double periods when base description ends with a period", () => {
      const riskScores: RiskScore[] = [
        makeRiskScore({ changedFilePath: "src/a.ts", overallRisk: 0.6 }),
      ];
      const selections: FrameworkSelection[] = [
        makeFrameworkSelection({
          framework: "boundary-value-analysis",
          reason: "Reason ending with a period.",
          relevantFiles: ["src/a.ts"],
          priority: "medium",
        }),
      ];
      const intent = makeIntent({
        changePurpose: "feature",
        extractionStatus: "parsed",
      });

      const themes = generateExplorationThemes(
        riskScores,
        selections,
        [],
        intent,
      );

      expect(themes[0].description).not.toContain("..");
    });
  });
});
