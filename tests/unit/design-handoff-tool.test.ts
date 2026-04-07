import { afterEach, describe, expect, it } from "vitest";

import { runDesignHandoff } from "../../src/exploratory-testing/tools/design-handoff";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import { populateFullAnalysisChain } from "../helpers/orchestration-fixtures";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("runDesignHandoff", () => {
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

  it("generates handoff draft from pre-populated analysis chain", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    const result = await runDesignHandoff({
      prNumber: 42,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect(result.prNumber).toBe(42);
    expect(result.repository).toBe("owner/repo");
    expect(result.draft.markdown).toBeTruthy();
    expect(result.summary.totalItems).toBeGreaterThan(0);
  });

  it("returns structured draft with section counts", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    const result = await runDesignHandoff({
      prNumber: 42,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    // Draft sections should have count and highlights
    expect(result.draft.alreadyCovered).toHaveProperty("count");
    expect(result.draft.alreadyCovered).toHaveProperty("highlights");
    expect(result.draft.shouldAutomate).toHaveProperty("count");
    expect(result.draft.manualExploration).toHaveProperty("count");

    // At least one section should have items
    const totalItems =
      result.draft.alreadyCovered.count +
      result.draft.shouldAutomate.count +
      result.draft.manualExploration.count;
    expect(totalItems).toBeGreaterThan(0);
  });

  it("result does not expose internal IDs", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    const result = await runDesignHandoff({
      prNumber: 42,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect("riskAssessmentId" in result).toBe(false);
    expect("prIntakeId" in result).toBe(false);
    expect("testMappingId" in result).toBe(false);
  });

  it("draft.markdown contains handoff sections suitable for file output", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    const result = await runDesignHandoff({
      prNumber: 42,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    // v2 format: requirement-based handoff
    expect(result.draft.markdown).toContain("## QA Handoff");
    expect(result.draft.markdown).toContain("### 実装要件");
    expect(result.draft.markdown).toContain("### テストレイヤー");
  });

  it("throws when no analysis exists for the PR", async () => {
    const workspace = await setupWorkspace();

    await expect(
      runDesignHandoff({
        prNumber: 999,
        configPath: workspace.configPath,
        manifestPath: workspace.manifestPath,
      }),
    ).rejects.toThrow(/No prior analysis found/);
  });

  it("returns workflow error instead of sqlite table error on fresh workspace", async () => {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);

    await expect(
      runDesignHandoff({
        prNumber: 999,
        configPath: workspace.configPath,
        manifestPath: workspace.manifestPath,
      }),
    ).rejects.toThrow(/No prior analysis found/);
  });
});
