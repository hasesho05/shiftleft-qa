import { describe, expect, it } from "vitest";

import { extractViewpointSeeds } from "../../src/exploratory-testing/analysis/extract-viewpoint-seeds";
import type { FileChangeAnalysis } from "../../src/exploratory-testing/models/change-analysis";

function makeAnalysis(
  overrides: Partial<FileChangeAnalysis> = {},
): FileChangeAnalysis {
  return {
    path: "src/index.ts",
    status: "modified",
    additions: 5,
    deletions: 2,
    categories: [],
    ...overrides,
  };
}

describe("extractViewpointSeeds", () => {
  it("returns all 5 viewpoints", () => {
    const analyses: readonly FileChangeAnalysis[] = [
      makeAnalysis({
        path: "src/components/LoginForm.tsx",
        categories: [
          { category: "ui", confidence: 0.8, reason: "React component" },
        ],
      }),
    ];

    const seeds = extractViewpointSeeds(analyses);

    expect(seeds).toHaveLength(5);
    const viewpoints = seeds.map((s) => s.viewpoint);
    expect(viewpoints).toContain("functional-user-flow");
    expect(viewpoints).toContain("user-persona");
    expect(viewpoints).toContain("ui-look-and-feel");
    expect(viewpoints).toContain("data-and-error-handling");
    expect(viewpoints).toContain("architecture-cross-cutting");
  });

  it("generates UI seeds from ui-categorized files", () => {
    const analyses: readonly FileChangeAnalysis[] = [
      makeAnalysis({
        path: "src/components/Button.tsx",
        categories: [
          { category: "ui", confidence: 0.9, reason: "React component" },
        ],
      }),
    ];

    const seeds = extractViewpointSeeds(analyses);
    const uiSeeds = seeds.find((s) => s.viewpoint === "ui-look-and-feel");

    expect(uiSeeds).toBeDefined();
    expect(uiSeeds?.seeds.length).toBeGreaterThanOrEqual(1);
  });

  it("generates functional flow seeds from api-categorized files", () => {
    const analyses: readonly FileChangeAnalysis[] = [
      makeAnalysis({
        path: "src/routes/users.ts",
        categories: [
          { category: "api", confidence: 0.85, reason: "API route" },
        ],
      }),
    ];

    const seeds = extractViewpointSeeds(analyses);
    const flowSeeds = seeds.find((s) => s.viewpoint === "functional-user-flow");

    expect(flowSeeds).toBeDefined();
    expect(flowSeeds?.seeds.length).toBeGreaterThanOrEqual(1);
  });

  it("generates data/error handling seeds from validation files", () => {
    const analyses: readonly FileChangeAnalysis[] = [
      makeAnalysis({
        path: "src/validators/userInput.ts",
        categories: [
          { category: "validation", confidence: 0.9, reason: "Validator" },
        ],
      }),
    ];

    const seeds = extractViewpointSeeds(analyses);
    const dataSeeds = seeds.find(
      (s) => s.viewpoint === "data-and-error-handling",
    );

    expect(dataSeeds).toBeDefined();
    expect(dataSeeds?.seeds.length).toBeGreaterThanOrEqual(1);
  });

  it("generates architecture seeds from cross-service and schema files", () => {
    const analyses: readonly FileChangeAnalysis[] = [
      makeAnalysis({
        path: "proto/user.proto",
        categories: [
          {
            category: "cross-service",
            confidence: 0.95,
            reason: "Proto file",
          },
        ],
      }),
      makeAnalysis({
        path: "db/migrations/001.sql",
        categories: [
          { category: "schema", confidence: 0.95, reason: "Migration" },
        ],
      }),
    ];

    const seeds = extractViewpointSeeds(analyses);
    const archSeeds = seeds.find(
      (s) => s.viewpoint === "architecture-cross-cutting",
    );

    expect(archSeeds).toBeDefined();
    expect(archSeeds?.seeds.length).toBeGreaterThanOrEqual(1);
  });

  it("generates persona seeds from permission files", () => {
    const analyses: readonly FileChangeAnalysis[] = [
      makeAnalysis({
        path: "src/middleware/auth.ts",
        categories: [
          { category: "permission", confidence: 0.85, reason: "Auth" },
        ],
      }),
    ];

    const seeds = extractViewpointSeeds(analyses);
    const personaSeeds = seeds.find((s) => s.viewpoint === "user-persona");

    expect(personaSeeds).toBeDefined();
    expect(personaSeeds?.seeds.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty analyses gracefully", () => {
    const seeds = extractViewpointSeeds([]);

    expect(seeds).toHaveLength(5);
    // All viewpoints should still be present, just with empty seeds
    for (const seed of seeds) {
      expect(seed.seeds).toEqual([]);
    }
  });

  it("handles files with multiple categories", () => {
    const analyses: readonly FileChangeAnalysis[] = [
      makeAnalysis({
        path: "src/api/validators/userInput.ts",
        categories: [
          { category: "api", confidence: 0.8, reason: "API" },
          { category: "validation", confidence: 0.75, reason: "Validator" },
        ],
      }),
    ];

    const seeds = extractViewpointSeeds(analyses);

    // Should populate both functional-user-flow (from api) and data-and-error-handling (from validation)
    const flowSeeds = seeds.find((s) => s.viewpoint === "functional-user-flow");
    const dataSeeds = seeds.find(
      (s) => s.viewpoint === "data-and-error-handling",
    );

    expect(flowSeeds?.seeds.length).toBeGreaterThanOrEqual(1);
    expect(dataSeeds?.seeds.length).toBeGreaterThanOrEqual(1);
  });
});
