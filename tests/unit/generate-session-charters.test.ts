import { describe, expect, it } from "vitest";

import { generateSessionCharters } from "../../src/exploratory-testing/analysis/generate-session-charters";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";
import type { ExplorationTheme } from "../../src/exploratory-testing/models/risk-assessment";
import type { CoverageGapEntry } from "../../src/exploratory-testing/models/test-mapping";

function createTheme(
  overrides: Partial<ExplorationTheme> = {},
): ExplorationTheme {
  return {
    title: "Boundary Value Analysis: auth.ts",
    description: "Test boundary values for token expiry and rate limits",
    frameworks: ["boundary-value-analysis"],
    targetFiles: ["src/middleware/auth.ts"],
    riskLevel: "high",
    estimatedMinutes: 20,
    ...overrides,
  };
}

function createGap(
  overrides: Partial<CoverageGapEntry> = {},
): CoverageGapEntry {
  return {
    changedFilePath: "src/middleware/auth.ts",
    aspect: "error-path",
    status: "uncovered",
    coveredBy: [],
    explorationPriority: "high",
    ...overrides,
  };
}

describe("generateSessionCharters", () => {
  it("generates one charter per exploration theme", () => {
    const themes = [
      createTheme({ title: "Theme A" }),
      createTheme({ title: "Theme B", targetFiles: ["src/routes/login.ts"] }),
    ];

    const charters = generateSessionCharters(themes, []);
    expect(charters).toHaveLength(2);
  });

  it("maps theme title to charter title", () => {
    const themes = [createTheme({ title: "Auth boundary validation" })];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].title).toBe("Auth boundary validation");
  });

  it("includes theme frameworks in selectedFrameworks", () => {
    const themes = [
      createTheme({
        frameworks: ["boundary-value-analysis", "error-guessing"],
      }),
    ];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].selectedFrameworks).toEqual([
      "boundary-value-analysis",
      "error-guessing",
    ]);
  });

  it("uses theme targetFiles as scope", () => {
    const themes = [
      createTheme({
        targetFiles: ["src/middleware/auth.ts", "src/routes/login.ts"],
      }),
    ];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].scope).toEqual([
      "src/middleware/auth.ts",
      "src/routes/login.ts",
    ]);
  });

  it("sets timebox from theme estimatedMinutes", () => {
    const themes = [createTheme({ estimatedMinutes: 25 })];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].timeboxMinutes).toBe(25);
  });

  it("generates a non-empty goal from description", () => {
    const themes = [
      createTheme({ description: "Test boundary values for token expiry" }),
    ];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].goal.length).toBeGreaterThan(0);
  });

  it("always includes at least one observation target", () => {
    const themes = [createTheme()];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].observationTargets.length).toBeGreaterThan(0);
  });

  it("includes network and console in observation targets for web-related files", () => {
    const themes = [
      createTheme({
        targetFiles: ["src/components/LoginForm.tsx"],
      }),
    ];
    const charters = generateSessionCharters(themes, []);
    const categories = charters[0].observationTargets.map((t) => t.category);
    expect(categories).toContain("network");
    expect(categories).toContain("console");
  });

  it("generates at least one stop condition", () => {
    const themes = [createTheme()];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].stopConditions.length).toBeGreaterThan(0);
  });

  it("enriches observation targets from coverage gaps", () => {
    const themes = [createTheme({ targetFiles: ["src/middleware/auth.ts"] })];
    const gaps = [createGap({ aspect: "permission", status: "uncovered" })];

    const charters = generateSessionCharters(themes, gaps);
    // Should mention permission checking in observation targets or preconditions
    const allText = JSON.stringify(charters[0]);
    expect(allText.toLowerCase()).toContain("permission");
  });

  it("generates preconditions for state-transition themes", () => {
    const themes = [
      createTheme({
        frameworks: ["state-transition"],
        title: "State Transition: order.ts",
      }),
    ];
    const charters = generateSessionCharters(themes, []);
    expect(charters[0].preconditions.length).toBeGreaterThan(0);
  });

  it("returns empty array when no themes given", () => {
    const charters = generateSessionCharters([], []);
    expect(charters).toHaveLength(0);
  });

  it("validates all generated charters against the schema", async () => {
    const { sessionCharterSchema } = await import(
      "../../src/exploratory-testing/models/session-charter"
    );

    const themes = [
      createTheme({ title: "Theme A", riskLevel: "high" }),
      createTheme({
        title: "Theme B",
        riskLevel: "medium",
        frameworks: ["state-transition"],
        targetFiles: ["src/components/LoginForm.tsx"],
      }),
      createTheme({
        title: "Theme C",
        riskLevel: "low",
        frameworks: ["error-guessing"],
      }),
    ];
    const gaps = [
      createGap({ aspect: "error-path", status: "uncovered" }),
      createGap({ aspect: "boundary", status: "partial" }),
    ];

    const charters = generateSessionCharters(themes, gaps);

    for (const charter of charters) {
      const result = sessionCharterSchema.safeParse(charter);
      expect(result.success, `Charter "${charter.title}" should be valid`).toBe(
        true,
      );
    }
  });

  it("orders charters by risk level (high first)", () => {
    const themes = [
      createTheme({
        title: "Low risk",
        riskLevel: "low",
        estimatedMinutes: 10,
      }),
      createTheme({
        title: "High risk",
        riskLevel: "high",
        estimatedMinutes: 10,
      }),
      createTheme({
        title: "Medium risk",
        riskLevel: "medium",
        estimatedMinutes: 10,
      }),
    ];

    const charters = generateSessionCharters(themes, []);
    expect(charters[0].title).toBe("High risk");
    expect(charters[1].title).toBe("Medium risk");
    expect(charters[2].title).toBe("Low risk");
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

    it("adds notesForQa to preconditions", () => {
      const themes = [createTheme()];
      const intent = makeIntent({
        notesForQa: ["Requires test admin account"],
        extractionStatus: "parsed",
      });

      const charters = generateSessionCharters(themes, [], intent);

      expect(charters[0].preconditions).toContain(
        "QA note: Requires test admin account",
      );
    });

    it("adds acceptance criteria to observation targets", () => {
      const themes = [createTheme()];
      const intent = makeIntent({
        acceptanceCriteria: ["Export button is visible on dashboard"],
        extractionStatus: "parsed",
      });

      const charters = generateSessionCharters(themes, [], intent);

      const acTargets = charters[0].observationTargets.filter(
        (t) => t.category === "acceptance-criteria",
      );
      expect(acTargets.length).toBeGreaterThanOrEqual(1);
      expect(acTargets[0].description).toContain("Export button is visible");
    });

    it("enriches goal with user story context", () => {
      const themes = [createTheme()];
      const intent = makeIntent({
        userStory: "As an admin, I can export reports",
        extractionStatus: "parsed",
      });

      const charters = generateSessionCharters(themes, [], intent);

      expect(charters[0].goal).toContain("export reports");
    });

    it("does not enrich when extractionStatus is empty", () => {
      const themes = [createTheme()];
      const intent = makeIntent({
        userStory: "Should be ignored",
        notesForQa: ["Also ignored"],
        extractionStatus: "empty",
      });

      const without = generateSessionCharters(themes, []);
      const with_ = generateSessionCharters(themes, [], intent);

      expect(without[0].goal).toBe(with_[0].goal);
      expect(without[0].preconditions).toEqual(with_[0].preconditions);
      expect(without[0].observationTargets).toEqual(
        with_[0].observationTargets,
      );
    });

    it("preserves existing preconditions and observation targets", () => {
      const themes = [
        createTheme({
          targetFiles: ["src/components/LoginForm.tsx"],
          frameworks: ["state-transition"],
        }),
      ];
      const gaps: CoverageGapEntry[] = [
        createGap({
          changedFilePath: "src/components/LoginForm.tsx",
          aspect: "error-path",
          status: "uncovered",
        }),
      ];
      const intent = makeIntent({
        notesForQa: ["Check timeout scenario"],
        extractionStatus: "parsed",
      });

      const charters = generateSessionCharters(themes, gaps, intent);

      // Should have both framework-derived and intent-derived preconditions
      expect(charters[0].preconditions.length).toBeGreaterThanOrEqual(2);
      expect(charters[0].preconditions.some((p) => p.includes("timeout"))).toBe(
        true,
      );
    });
  });
});
