import { describe, expect, it } from "vitest";

import { extractIntentViewpointSeeds } from "../../src/exploratory-testing/analysis/extract-viewpoint-seeds";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";

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

describe("extractIntentViewpointSeeds", () => {
  it("returns empty array when intent extraction status is empty", () => {
    const seeds = extractIntentViewpointSeeds(makeIntent());

    expect(seeds).toEqual([]);
  });

  it("maps userStory to user-persona and functional-user-flow", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        userStory: "As an admin, I can export reports as CSV",
        extractionStatus: "parsed",
      }),
    );

    const persona = seeds.find((s) => s.viewpoint === "user-persona");
    const flow = seeds.find((s) => s.viewpoint === "functional-user-flow");

    expect(persona?.seeds.length).toBeGreaterThanOrEqual(1);
    expect(persona?.seeds[0]).toContain("admin");
    expect(flow?.seeds.length).toBeGreaterThanOrEqual(1);
    expect(flow?.seeds[0]).toContain("export reports as CSV");
  });

  it("maps targetUsers to user-persona", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        targetUsers: ["admin", "read-only viewer"],
        extractionStatus: "parsed",
      }),
    );

    const persona = seeds.find((s) => s.viewpoint === "user-persona");

    expect(persona?.seeds.length).toBe(1);
    expect(persona?.seeds[0]).toContain("admin");
    expect(persona?.seeds[0]).toContain("read-only viewer");
  });

  it("maps acceptanceCriteria to functional-user-flow and data-and-error-handling", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        acceptanceCriteria: [
          "CSV file contains all columns",
          "Error shown for empty dataset",
        ],
        extractionStatus: "parsed",
      }),
    );

    const flow = seeds.find((s) => s.viewpoint === "functional-user-flow");
    const data = seeds.find((s) => s.viewpoint === "data-and-error-handling");

    expect(flow?.seeds.length).toBeGreaterThanOrEqual(1);
    expect(data?.seeds.length).toBeGreaterThanOrEqual(1);
  });

  it("maps nonGoals to architecture-cross-cutting as scope constraint", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        nonGoals: [
          "No PDF export in this PR",
          "Performance optimization deferred",
        ],
        extractionStatus: "parsed",
      }),
    );

    const arch = seeds.find(
      (s) => s.viewpoint === "architecture-cross-cutting",
    );

    expect(arch?.seeds.length).toBe(1);
    expect(arch?.seeds[0]).toContain("Non-goal");
    expect(arch?.seeds[0]).toContain("No PDF export");
  });

  it("maps notesForQa to data-and-error-handling", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        notesForQa: [
          "Check edge case with empty table",
          "Verify timeout behavior",
        ],
        extractionStatus: "parsed",
      }),
    );

    const data = seeds.find((s) => s.viewpoint === "data-and-error-handling");

    expect(data?.seeds.length).toBeGreaterThanOrEqual(1);
    expect(data?.seeds[0]).toContain("Check edge case with empty table");
  });

  it("maps changePurpose=bugfix to data-and-error-handling with regression emphasis", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        changePurpose: "bugfix",
        extractionStatus: "parsed",
      }),
    );

    const data = seeds.find((s) => s.viewpoint === "data-and-error-handling");

    expect(data?.seeds.length).toBeGreaterThanOrEqual(1);
    expect(data?.seeds[0]).toMatch(/bugfix|regression|error/i);
  });

  it("maps changePurpose=feature to functional-user-flow", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        changePurpose: "feature",
        extractionStatus: "parsed",
      }),
    );

    const flow = seeds.find((s) => s.viewpoint === "functional-user-flow");

    expect(flow?.seeds.length).toBeGreaterThanOrEqual(1);
    expect(flow?.seeds[0]).toMatch(/new feature|end-to-end/i);
  });

  it("combines multiple intent fields without duplication", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        changePurpose: "feature",
        userStory: "As an admin, I can export reports",
        targetUsers: ["admin"],
        acceptanceCriteria: ["Export button visible"],
        notesForQa: ["Test with large datasets"],
        extractionStatus: "parsed",
      }),
    );

    // Should have seeds across multiple viewpoints
    const nonEmpty = seeds.filter((s) => s.seeds.length > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty array when extractionStatus is empty even with fields set", () => {
    const seeds = extractIntentViewpointSeeds(
      makeIntent({
        changePurpose: "feature",
        extractionStatus: "empty",
      }),
    );

    expect(seeds).toEqual([]);
  });
});
