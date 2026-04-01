import { describe, expect, it } from "vitest";

import {
  explorationFrameworkSchema,
  explorationThemeSchema,
  frameworkSelectionSchema,
  riskAssessmentResultSchema,
  riskScoreSchema,
} from "../../src/exploratory-testing/models/risk-assessment";

describe("risk-assessment model schemas", () => {
  describe("explorationFrameworkSchema", () => {
    const VALID_FRAMEWORKS = [
      "equivalence-partitioning",
      "boundary-value-analysis",
      "state-transition",
      "decision-table",
      "cause-effect-graph",
      "pairwise",
      "sampling",
      "error-guessing",
    ] as const;

    it("accepts all 8 valid framework names", () => {
      for (const name of VALID_FRAMEWORKS) {
        expect(explorationFrameworkSchema.parse(name)).toBe(name);
      }
    });

    it("rejects unknown framework names", () => {
      expect(() =>
        explorationFrameworkSchema.parse("random-testing"),
      ).toThrow();
    });
  });

  describe("riskScoreSchema", () => {
    it("accepts a valid risk score object", () => {
      const score = {
        changedFilePath: "src/auth/login.ts",
        overallRisk: 0.8,
        factors: [
          { factor: "uncovered-aspects", weight: 0.5, contribution: 0.4 },
          { factor: "change-magnitude", weight: 0.3, contribution: 0.24 },
        ],
      };
      expect(riskScoreSchema.parse(score)).toEqual(score);
    });

    it("rejects overallRisk outside 0-1 range", () => {
      const score = {
        changedFilePath: "src/foo.ts",
        overallRisk: 1.5,
        factors: [],
      };
      expect(() => riskScoreSchema.parse(score)).toThrow();
    });

    it("rejects negative overallRisk", () => {
      const score = {
        changedFilePath: "src/foo.ts",
        overallRisk: -0.1,
        factors: [],
      };
      expect(() => riskScoreSchema.parse(score)).toThrow();
    });
  });

  describe("frameworkSelectionSchema", () => {
    it("accepts a valid framework selection", () => {
      const selection = {
        framework: "boundary-value-analysis" as const,
        reason: "Validation logic changes require boundary testing",
        relevantFiles: ["src/validators/amount.ts"],
        priority: "high" as const,
      };
      expect(frameworkSelectionSchema.parse(selection)).toEqual(selection);
    });

    it("requires non-empty reason", () => {
      const selection = {
        framework: "boundary-value-analysis" as const,
        reason: "",
        relevantFiles: [],
        priority: "medium" as const,
      };
      expect(() => frameworkSelectionSchema.parse(selection)).toThrow();
    });
  });

  describe("explorationThemeSchema", () => {
    it("accepts a valid exploration theme", () => {
      const theme = {
        title: "Boundary values for payment amount",
        description: "Explore min/max payment amount boundaries",
        frameworks: ["boundary-value-analysis" as const],
        targetFiles: ["src/payment/validate.ts"],
        riskLevel: "high" as const,
        estimatedMinutes: 15,
      };
      expect(explorationThemeSchema.parse(theme)).toEqual(theme);
    });

    it("requires at least one framework", () => {
      const theme = {
        title: "Empty",
        description: "No frameworks",
        frameworks: [],
        targetFiles: [],
        riskLevel: "low" as const,
        estimatedMinutes: 5,
      };
      expect(() => explorationThemeSchema.parse(theme)).toThrow();
    });

    it("rejects estimatedMinutes below 1", () => {
      const theme = {
        title: "Quick",
        description: "Too quick",
        frameworks: ["error-guessing" as const],
        targetFiles: [],
        riskLevel: "low" as const,
        estimatedMinutes: 0,
      };
      expect(() => explorationThemeSchema.parse(theme)).toThrow();
    });
  });

  describe("riskAssessmentResultSchema", () => {
    it("accepts a complete risk assessment result", () => {
      const result = {
        testMappingId: 1,
        riskScores: [
          {
            changedFilePath: "src/auth/login.ts",
            overallRisk: 0.8,
            factors: [
              {
                factor: "uncovered-aspects",
                weight: 0.5,
                contribution: 0.4,
              },
            ],
          },
        ],
        frameworkSelections: [
          {
            framework: "state-transition" as const,
            reason: "Auth flow has multi-step state transitions",
            relevantFiles: ["src/auth/login.ts"],
            priority: "high" as const,
          },
        ],
        explorationThemes: [
          {
            title: "Auth state transitions",
            description: "Explore login state machine",
            frameworks: ["state-transition" as const],
            targetFiles: ["src/auth/login.ts"],
            riskLevel: "high" as const,
            estimatedMinutes: 20,
          },
        ],
        assessedAt: "2025-01-01T00:00:00.000Z",
      };
      expect(riskAssessmentResultSchema.parse(result)).toEqual(result);
    });

    it("requires positive testMappingId", () => {
      const result = {
        testMappingId: 0,
        riskScores: [],
        frameworkSelections: [],
        explorationThemes: [],
        assessedAt: "2025-01-01T00:00:00.000Z",
      };
      expect(() => riskAssessmentResultSchema.parse(result)).toThrow();
    });
  });
});
