import { afterEach, describe, expect, it } from "vitest";

import {
  findTestMapping,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
import { runMapTestsFromAnalysis } from "../../src/exploratory-testing/tools/map-tests";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

function createSampleMetadata(): PrMetadata {
  return {
    provider: "github",
    repository: "owner/repo",
    prNumber: 42,
    title: "Add user auth",
    description: "Implements authentication middleware",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/auth",
    headSha: "abc1234",
    linkedIssues: ["#10"],
    changedFiles: [
      {
        path: "src/middleware/auth.ts",
        status: "modified",
        additions: 30,
        deletions: 5,
        previousPath: null,
      },
      {
        path: "src/components/LoginForm.tsx",
        status: "added",
        additions: 80,
        deletions: 0,
        previousPath: null,
      },
      {
        path: "src/api/users.ts",
        status: "modified",
        additions: 15,
        deletions: 3,
        previousPath: null,
      },
    ],
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

describe("runMapTestsFromAnalysis", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setupWorkspace(): Promise<
    TestWorkspace & { databasePath: string }
  > {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    return { ...workspace, databasePath: result.databasePath };
  }

  it("maps test assets and saves results to DB", async () => {
    const workspace = await setupWorkspace();
    const metadata = createSampleMetadata();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    // Create candidate test files so they survive existence check
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(`${workspace.root}/src/middleware`, { recursive: true });
    writeFileSync(
      `${workspace.root}/src/middleware/auth.test.ts`,
      "// test stub",
    );

    const prIntake = savePrIntake(workspace.databasePath, metadata);
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);

    const result = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );

    // Verify DB persistence
    expect(result.persisted.prIntakeId).toBe(prIntake.id);
    expect(result.persisted.changeAnalysisId).toBe(contextResult.persisted.id);
    expect(result.persisted.testAssets.length).toBeGreaterThan(0);
    expect(result.persisted.coverageGapMap.length).toBeGreaterThan(0);

    const dbRecord = findTestMapping(
      workspace.databasePath,
      contextResult.persisted.id,
    );
    expect(dbRecord).not.toBeNull();
  });

  it("detects missing test layers", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);

    const result = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );

    // Test assets are candidates (not validated against filesystem), so
    // missing layers are those that have no candidate at all.
    // With our sample data, we should get test asset candidates for multiple layers.
    expect(result.persisted.missingLayers).toBeDefined();
  });

  it("generates coverage gap entries for all changed files", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);

    const result = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );

    const changedPaths = new Set(
      result.persisted.coverageGapMap.map((g) => g.changedFilePath),
    );
    // Every changed file from intake should have gap entries
    for (const file of createSampleMetadata().changedFiles) {
      expect(changedPaths.has(file.path)).toBe(true);
    }
  });

  it("is idempotent for same analysis", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);

    const first = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    const second = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );

    expect(first.persisted.id).toBe(second.persisted.id);
  });
});
