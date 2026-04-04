import { afterEach, describe, expect, it } from "vitest";

import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import {
  type WorkspaceHealthReport,
  checkWorkspaceHealth,
} from "../../src/exploratory-testing/tools/doctor";
import { writeStepHandoverFromConfig } from "../../src/exploratory-testing/tools/progress";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

async function registerWorkspace(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();
  workspaces.push(workspace.root);
  return workspace;
}

describe("checkWorkspaceHealth", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  it("reports healthy workspace with no issues", async () => {
    const workspace = await registerWorkspace();
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const report = await checkWorkspaceHealth(config);

    expect(report.databaseAccessible).toBe(true);
    expect(report.divergences).toEqual([]);
    expect(report.staleSteps).toEqual([]);
  });

  it("reports stale downstream steps after upstream re-run", async () => {
    const workspace = await registerWorkspace();
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await writeStepHandoverFromConfig(config, {
      stepName: "pr-intake",
      status: "completed",
      summary: "done",
      updatedAt: "2026-01-01T01:00:00.000Z",
    });
    await writeStepHandoverFromConfig(config, {
      stepName: "discover-context",
      status: "completed",
      summary: "done",
      updatedAt: "2026-01-01T02:00:00.000Z",
    });
    // Re-run pr-intake
    await writeStepHandoverFromConfig(config, {
      stepName: "pr-intake",
      status: "completed",
      summary: "re-done",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const report = await checkWorkspaceHealth(config);

    expect(report.databaseAccessible).toBe(true);
    expect(report.staleSteps.length).toBeGreaterThanOrEqual(1);
    expect(
      report.staleSteps.some((s) => s.stepName === "discover-context"),
    ).toBe(true);
  });

  it("detects inaccessible database path", async () => {
    const workspace = await registerWorkspace();
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    // Override database path to invalid location
    const brokenConfig = {
      ...config,
      paths: {
        ...config.paths,
        database: "/nonexistent/path/db.sqlite",
      },
    };

    const report = await checkWorkspaceHealth(brokenConfig);

    expect(report.databaseAccessible).toBe(false);
  });
});
