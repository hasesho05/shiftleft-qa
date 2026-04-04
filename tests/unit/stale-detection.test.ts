import { afterEach, describe, expect, it } from "vitest";

import {
  type StaleStepInfo,
  detectStaleDownstreamSteps,
  initializeWorkspaceDatabase,
  upsertStepHandoverRecord,
} from "../../src/exploratory-testing/db/workspace-repository";
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

function writeStep(
  databasePath: string,
  stepName: string,
  status: "completed" | "in_progress" | "pending",
  updatedAt: string,
): void {
  upsertStepHandoverRecord(databasePath, {
    stepName,
    status,
    summary: `${stepName} summary`,
    nextStep: null,
    progressPath: `progress/${stepName}.md`,
    updatedAt,
    completedAt: status === "completed" ? updatedAt : null,
    frontmatterJson: JSON.stringify({ step_name: stepName }),
    bodyMarkdown: `# ${stepName}`,
  });
}

describe("detectStaleDownstreamSteps", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  it("returns empty array when no downstream steps have been run", async () => {
    const workspace = await registerWorkspace();
    const setup = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );

    const stale = detectStaleDownstreamSteps(
      setup.databasePath,
      "export-artifacts",
    );

    expect(stale).toEqual([]);
  });

  it("returns empty array when downstream steps are pending", async () => {
    const workspace = await registerWorkspace();
    const setup = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );

    writeStep(
      setup.databasePath,
      "setup",
      "completed",
      "2026-01-01T00:00:00.000Z",
    );

    const stale = detectStaleDownstreamSteps(setup.databasePath, "setup");

    expect(stale).toEqual([]);
  });

  it("detects stale downstream when upstream is re-run with newer timestamp", async () => {
    const workspace = await registerWorkspace();
    const setup = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );

    writeStep(
      setup.databasePath,
      "setup",
      "completed",
      "2026-01-01T00:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "pr-intake",
      "completed",
      "2026-01-01T01:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "discover-context",
      "completed",
      "2026-01-01T02:00:00.000Z",
    );

    // Re-run pr-intake with newer timestamp
    writeStep(
      setup.databasePath,
      "pr-intake",
      "completed",
      "2026-01-02T00:00:00.000Z",
    );

    const stale = detectStaleDownstreamSteps(setup.databasePath, "pr-intake");

    expect(stale.length).toBe(1);
    expect(stale[0].stepName).toBe("discover-context");
    expect(stale[0].staleReason).toContain("pr-intake");
  });

  it("detects multiple stale downstream steps", async () => {
    const workspace = await registerWorkspace();
    const setup = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );

    writeStep(
      setup.databasePath,
      "setup",
      "completed",
      "2026-01-01T00:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "pr-intake",
      "completed",
      "2026-01-01T01:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "discover-context",
      "completed",
      "2026-01-01T02:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "map-tests",
      "completed",
      "2026-01-01T03:00:00.000Z",
    );

    // Re-run pr-intake
    writeStep(
      setup.databasePath,
      "pr-intake",
      "completed",
      "2026-01-02T00:00:00.000Z",
    );

    const stale = detectStaleDownstreamSteps(setup.databasePath, "pr-intake");

    expect(stale.length).toBe(2);
    expect(stale.map((s) => s.stepName)).toEqual([
      "discover-context",
      "map-tests",
    ]);
  });

  it("does not flag downstream steps updated after the re-run", async () => {
    const workspace = await registerWorkspace();
    const setup = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );

    writeStep(
      setup.databasePath,
      "setup",
      "completed",
      "2026-01-01T00:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "pr-intake",
      "completed",
      "2026-01-01T01:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "discover-context",
      "completed",
      "2026-01-01T02:00:00.000Z",
    );

    // Re-run pr-intake
    writeStep(
      setup.databasePath,
      "pr-intake",
      "completed",
      "2026-01-02T00:00:00.000Z",
    );
    // Re-run discover-context too
    writeStep(
      setup.databasePath,
      "discover-context",
      "completed",
      "2026-01-02T01:00:00.000Z",
    );

    const stale = detectStaleDownstreamSteps(setup.databasePath, "pr-intake");

    expect(stale).toEqual([]);
  });

  it("ignores steps that are still in_progress or pending", async () => {
    const workspace = await registerWorkspace();
    const setup = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );

    writeStep(
      setup.databasePath,
      "setup",
      "completed",
      "2026-01-01T00:00:00.000Z",
    );
    writeStep(
      setup.databasePath,
      "pr-intake",
      "completed",
      "2026-01-01T01:00:00.000Z",
    );

    // Re-run setup
    writeStep(
      setup.databasePath,
      "setup",
      "completed",
      "2026-01-02T00:00:00.000Z",
    );

    // pr-intake was completed before the re-run, so it's stale
    const stale = detectStaleDownstreamSteps(setup.databasePath, "setup");

    expect(stale.length).toBe(1);
    expect(stale[0].stepName).toBe("pr-intake");
  });
});
