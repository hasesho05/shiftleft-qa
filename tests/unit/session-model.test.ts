import { describe, expect, it } from "vitest";

import {
  observationOutcomeSchema,
  observationSchema,
  sessionSchema,
  sessionStatusSchema,
} from "../../src/exploratory-testing/models/session";

describe("sessionStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const status of [
      "planned",
      "in_progress",
      "interrupted",
      "completed",
    ]) {
      expect(sessionStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() => sessionStatusSchema.parse("running")).toThrow();
  });
});

describe("observationOutcomeSchema", () => {
  it("accepts valid outcomes", () => {
    for (const outcome of ["pass", "fail", "unclear", "suspicious"]) {
      expect(observationOutcomeSchema.parse(outcome)).toBe(outcome);
    }
  });

  it("rejects invalid outcome", () => {
    expect(() => observationOutcomeSchema.parse("maybe")).toThrow();
  });
});

describe("observationSchema", () => {
  it("accepts a valid observation", () => {
    const observation = {
      targetedHeuristic: "boundary-value",
      action: "Enter max length + 1 characters",
      expected: "Validation error shown",
      actual: "Validation error shown",
      outcome: "pass",
      note: "Works as expected",
      evidencePath: "evidence/screenshot-01.png",
    };
    const result = observationSchema.parse(observation);
    expect(result.targetedHeuristic).toBe("boundary-value");
    expect(result.outcome).toBe("pass");
    expect(result.evidencePath).toBe("evidence/screenshot-01.png");
  });

  it("accepts observation with null evidencePath", () => {
    const observation = {
      targetedHeuristic: "error-guessing",
      action: "Submit empty form",
      expected: "Error displayed",
      actual: "Error displayed",
      outcome: "pass",
      note: "",
      evidencePath: null,
    };
    const result = observationSchema.parse(observation);
    expect(result.evidencePath).toBeNull();
  });

  it("rejects observation missing required fields", () => {
    expect(() =>
      observationSchema.parse({
        targetedHeuristic: "boundary-value",
        action: "Do something",
      }),
    ).toThrow();
  });
});

describe("sessionSchema", () => {
  it("accepts a valid session", () => {
    const session = {
      sessionChartersId: 1,
      charterIndex: 0,
      charterTitle: "Explore boundary validation",
      status: "planned",
      startedAt: null,
      interruptedAt: null,
      completedAt: null,
      interruptReason: null,
    };
    const result = sessionSchema.parse(session);
    expect(result.status).toBe("planned");
    expect(result.sessionChartersId).toBe(1);
    expect(result.charterIndex).toBe(0);
  });

  it("accepts an in_progress session", () => {
    const session = {
      sessionChartersId: 1,
      charterIndex: 0,
      charterTitle: "Explore boundary validation",
      status: "in_progress",
      startedAt: "2026-04-01T00:00:00Z",
      interruptedAt: null,
      completedAt: null,
      interruptReason: null,
    };
    const result = sessionSchema.parse(session);
    expect(result.status).toBe("in_progress");
    expect(result.startedAt).toBe("2026-04-01T00:00:00Z");
  });

  it("accepts an interrupted session with reason", () => {
    const session = {
      sessionChartersId: 1,
      charterIndex: 0,
      charterTitle: "Explore boundary validation",
      status: "interrupted",
      startedAt: "2026-04-01T00:00:00Z",
      interruptedAt: "2026-04-01T00:15:00Z",
      completedAt: null,
      interruptReason: "Environment went down",
    };
    const result = sessionSchema.parse(session);
    expect(result.interruptReason).toBe("Environment went down");
  });

  it("rejects invalid sessionChartersId", () => {
    expect(() =>
      sessionSchema.parse({
        sessionChartersId: 0,
        charterIndex: 0,
        charterTitle: "Test",
        status: "planned",
        startedAt: null,
        interruptedAt: null,
        completedAt: null,
        interruptReason: null,
      }),
    ).toThrow();
  });
});
