import { afterEach, describe, expect, it } from "vitest";

import { runPublishHandoffOrchestration } from "../../src/exploratory-testing/tools/publish-handoff-orchestration";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import { populateFullAnalysisChain } from "../helpers/orchestration-fixtures";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("runPublishHandoffOrchestration", () => {
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

  it("throws when no analysis exists for the PR", async () => {
    const workspace = await setupWorkspace();

    await expect(
      runPublishHandoffOrchestration({
        prNumber: 999,
        provider: "github",
        repository: "owner/repo",
        configPath: workspace.configPath,
        manifestPath: workspace.manifestPath,
      }),
    ).rejects.toThrow(/No analysis found/);
  });

  it("throws when analysis exists but no allocation (design-handoff not run)", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    // populateFullAnalysisChain creates prIntake → riskAssessment but NO allocation items.
    // publish-handoff should detect this and throw.
    await expect(
      runPublishHandoffOrchestration({
        prNumber: 42,
        provider: "github",
        repository: "owner/repo",
        configPath: workspace.configPath,
        manifestPath: workspace.manifestPath,
      }),
    ).rejects.toThrow(/No allocation found.*design-handoff/);
  });
});
