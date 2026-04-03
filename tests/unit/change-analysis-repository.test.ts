import { afterEach, describe, expect, it } from "vitest";

import {
  findChangeAnalysis,
  saveChangeAnalysis,
} from "../../src/exploratory-testing/db/workspace-repository";
import { savePrIntake } from "../../src/exploratory-testing/db/workspace-repository";
import type { ChangeAnalysisResult } from "../../src/exploratory-testing/models/change-analysis";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

function createSamplePrMetadata(): PrMetadata {
  return {
    provider: "github",
    repository: "owner/repo",
    prNumber: 42,
    title: "Add feature X",
    description: "Implements feature X",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/x",
    headSha: "abc1234def5678",
    linkedIssues: ["#10"],
    changedFiles: [
      {
        path: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 2,
        previousPath: null,
      },
    ],
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

function createSampleAnalysis(prIntakeId: number): ChangeAnalysisResult {
  return {
    prIntakeId,
    fileAnalyses: [
      {
        path: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 2,
        categories: [
          { category: "api", confidence: 0.8, reason: "API route file" },
        ],
      },
    ],
    relatedCodes: [
      {
        path: "tests/unit/index.test.ts",
        relation: "test",
        confidence: 0.7,
        reason: "Test file for index",
      },
    ],
    viewpointSeeds: [
      {
        viewpoint: "functional-user-flow",
        seeds: ["API endpoint change may affect client calls"],
      },
      {
        viewpoint: "user-persona",
        seeds: [],
      },
      {
        viewpoint: "ui-look-and-feel",
        seeds: [],
      },
      {
        viewpoint: "data-and-error-handling",
        seeds: ["API endpoint change — verify error responses"],
      },
      {
        viewpoint: "architecture-cross-cutting",
        seeds: [],
      },
    ],
    summary: "API change in index.ts with test coverage",
    analyzedAt: "2026-04-01T00:00:00Z",
  };
}

describe("change analysis repository", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setupWorkspace(): Promise<{ databasePath: string }> {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    return { databasePath: result.databasePath };
  }

  it("saves and retrieves a change analysis", async () => {
    const { databasePath } = await setupWorkspace();
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
    const analysis = createSampleAnalysis(prIntake.id);

    const saved = saveChangeAnalysis(databasePath, analysis);

    expect(saved.id).toBeGreaterThan(0);
    expect(saved.prIntakeId).toBe(prIntake.id);
    expect(saved.fileAnalyses).toHaveLength(1);
    expect(saved.relatedCodes).toHaveLength(1);
    expect(saved.viewpointSeeds).toHaveLength(5);
    expect(saved.summary).toBe("API change in index.ts with test coverage");
  });

  it("finds the latest change analysis for a PR intake", async () => {
    const { databasePath } = await setupWorkspace();
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
    const analysis = createSampleAnalysis(prIntake.id);

    saveChangeAnalysis(databasePath, analysis);

    const found = findChangeAnalysis(databasePath, prIntake.id);

    expect(found).not.toBeNull();
    expect(found?.prIntakeId).toBe(prIntake.id);
    expect(found?.fileAnalyses[0]?.categories[0]?.category).toBe("api");
  });

  it("returns null when no analysis found", async () => {
    const { databasePath } = await setupWorkspace();

    const found = findChangeAnalysis(databasePath, 999);

    expect(found).toBeNull();
  });

  it("upserts on same prIntakeId", async () => {
    const { databasePath } = await setupWorkspace();
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());

    saveChangeAnalysis(databasePath, createSampleAnalysis(prIntake.id));
    const updated = saveChangeAnalysis(databasePath, {
      ...createSampleAnalysis(prIntake.id),
      summary: "Updated analysis",
    });

    expect(updated.summary).toBe("Updated analysis");

    // Should still be only 1 record
    const found = findChangeAnalysis(databasePath, prIntake.id);
    expect(found?.summary).toBe("Updated analysis");
  });

  it("round-trips JSON columns through Valibot validation", async () => {
    const { databasePath } = await setupWorkspace();
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
    const analysis = createSampleAnalysis(prIntake.id);

    saveChangeAnalysis(databasePath, analysis);
    const found = findChangeAnalysis(databasePath, prIntake.id);

    expect(found?.fileAnalyses[0]?.path).toBe("src/index.ts");
    expect(found?.relatedCodes[0]?.relation).toBe("test");
    expect(found?.viewpointSeeds[0]?.viewpoint).toBe("functional-user-flow");
  });
});
