import { describe, expect, it } from "vitest";

import {
  type SessionCharter,
  type SessionCharterGenerationResult,
  sessionCharterGenerationResultSchema,
  sessionCharterSchema,
} from "../../src/exploratory-testing/models/session-charter";

describe("sessionCharterSchema", () => {
  function createValidCharter(): SessionCharter {
    return {
      title: "Verify auth error handling",
      goal: "Confirm that invalid tokens return 401 and log the attempt",
      scope: ["src/middleware/auth.ts", "src/routes/login.ts"],
      selectedFrameworks: ["error-guessing", "boundary-value-analysis"],
      preconditions: ["User is logged out", "Server is running with test DB"],
      observationTargets: [
        {
          category: "network",
          description: "Check response status codes for malformed tokens",
        },
        {
          category: "console",
          description: "Watch for unhandled promise rejections",
        },
      ],
      stopConditions: [
        "All error scenarios from the decision table have been tested",
        "A blocking defect is found",
      ],
      timeboxMinutes: 20,
    };
  }

  it("accepts a valid session charter", () => {
    const charter = createValidCharter();
    const result = sessionCharterSchema.safeParse(charter);
    expect(result.success).toBe(true);
  });

  it("rejects a charter with empty title", () => {
    const charter = { ...createValidCharter(), title: "" };
    const result = sessionCharterSchema.safeParse(charter);
    expect(result.success).toBe(false);
  });

  it("rejects a charter with empty scope", () => {
    const charter = { ...createValidCharter(), scope: [] };
    const result = sessionCharterSchema.safeParse(charter);
    expect(result.success).toBe(false);
  });

  it("rejects a charter with no frameworks", () => {
    const charter = { ...createValidCharter(), selectedFrameworks: [] };
    const result = sessionCharterSchema.safeParse(charter);
    expect(result.success).toBe(false);
  });

  it("rejects a charter with no observation targets", () => {
    const charter = { ...createValidCharter(), observationTargets: [] };
    const result = sessionCharterSchema.safeParse(charter);
    expect(result.success).toBe(false);
  });

  it("rejects a charter with zero timebox", () => {
    const charter = { ...createValidCharter(), timeboxMinutes: 0 };
    const result = sessionCharterSchema.safeParse(charter);
    expect(result.success).toBe(false);
  });

  it("accepts valid observation target categories", () => {
    const categories = [
      "ui",
      "network",
      "console",
      "devtools",
      "state",
      "accessibility",
      "performance",
    ] as const;

    for (const category of categories) {
      const charter = createValidCharter();
      charter.observationTargets[0] = {
        category,
        description: `Observe ${category}`,
      };
      const result = sessionCharterSchema.safeParse(charter);
      expect(result.success, `category "${category}" should be valid`).toBe(
        true,
      );
    }
  });
});

describe("sessionCharterGenerationResultSchema", () => {
  it("accepts a valid generation result", () => {
    const result: SessionCharterGenerationResult = {
      riskAssessmentId: 1,
      charters: [
        {
          title: "Verify auth error handling",
          goal: "Confirm error responses",
          scope: ["src/middleware/auth.ts"],
          selectedFrameworks: ["error-guessing"],
          preconditions: ["Server is running"],
          observationTargets: [
            { category: "network", description: "Check 401 responses" },
          ],
          stopConditions: ["All scenarios tested"],
          timeboxMinutes: 15,
        },
      ],
      generatedAt: "2026-04-01T00:00:00Z",
    };

    const parsed = sessionCharterGenerationResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("rejects a result with zero riskAssessmentId", () => {
    const result = {
      riskAssessmentId: 0,
      charters: [],
      generatedAt: "2026-04-01T00:00:00Z",
    };
    const parsed = sessionCharterGenerationResultSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });
});
