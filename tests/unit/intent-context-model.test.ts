import { describe, expect, it } from "vitest";

import {
  type IntentContext,
  changePurposeSchema,
  extractionStatusSchema,
  intentContextSchema,
} from "../../src/exploratory-testing/models/intent-context";

describe("intent context model", () => {
  it("validates a fully populated intent context", () => {
    const input: IntentContext = {
      changePurpose: "feature",
      userStory: "As a user, I want to see my dashboard",
      acceptanceCriteria: ["Shows recent activity", "Loads in < 2s"],
      nonGoals: ["Mobile support"],
      targetUsers: ["Admin users"],
      notesForQa: ["Check with slow network"],
      sourceRefs: ["#10", "#42"],
      extractionStatus: "parsed",
    };

    const result = intentContextSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.changePurpose).toBe("feature");
      expect(result.data.acceptanceCriteria).toHaveLength(2);
    }
  });

  it("validates a minimal (empty) intent context", () => {
    const input: IntentContext = {
      changePurpose: null,
      userStory: null,
      acceptanceCriteria: [],
      nonGoals: [],
      targetUsers: [],
      notesForQa: [],
      sourceRefs: [],
      extractionStatus: "empty",
    };

    const result = intentContextSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extractionStatus).toBe("empty");
    }
  });

  it("validates all changePurpose values", () => {
    const purposes = [
      "feature",
      "bugfix",
      "refactor",
      "config",
      "docs",
      "other",
    ] as const;

    for (const purpose of purposes) {
      const result = changePurposeSchema.safeParse(purpose);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid changePurpose", () => {
    const result = changePurposeSchema.safeParse("unknown");
    expect(result.success).toBe(false);
  });

  it("validates all extractionStatus values", () => {
    for (const status of ["empty", "parsed", "partial"] as const) {
      const result = extractionStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid extractionStatus", () => {
    const result = extractionStatusSchema.safeParse("full");
    expect(result.success).toBe(false);
  });

  it("allows null for optional string fields", () => {
    const input: IntentContext = {
      changePurpose: null,
      userStory: null,
      acceptanceCriteria: [],
      nonGoals: [],
      targetUsers: [],
      notesForQa: [],
      sourceRefs: [],
      extractionStatus: "empty",
    };

    const result = intentContextSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.changePurpose).toBeNull();
      expect(result.data.userStory).toBeNull();
    }
  });
});
