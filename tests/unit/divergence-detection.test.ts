import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import matter from "gray-matter";

import {
  type DivergenceEntry,
  type DivergenceReport,
  detectProgressDivergence,
} from "../../src/exploratory-testing/db/workspace-repository";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
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

describe("detectProgressDivergence", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  it("returns no divergences when DB and files are in sync", async () => {
    const workspace = await registerWorkspace();
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await writeStepHandoverFromConfig(config, {
      stepName: "pr-intake",
      status: "completed",
      summary: "PR intake done",
      nextStep: "discover-context",
    });

    const report = await detectProgressDivergence(
      config.paths.database,
      config.workspaceRoot,
    );

    expect(report.divergences).toEqual([]);
    expect(report.totalChecked).toBeGreaterThan(0);
  });

  it("detects status mismatch between DB and file", async () => {
    const workspace = await registerWorkspace();
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await writeStepHandoverFromConfig(config, {
      stepName: "pr-intake",
      status: "completed",
      summary: "PR intake done",
      nextStep: "discover-context",
    });

    // Manually tamper with the progress file to create divergence
    const filePath = resolve(config.paths.progressDirectory, "02-pr-intake.md");
    const fileContent = matter.stringify("# PR or MR intake\n", {
      step: 2,
      step_name: "pr-intake",
      skill: "pr-intake",
      status: "in_progress",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await writeFile(filePath, fileContent, "utf8");

    const report = await detectProgressDivergence(
      config.paths.database,
      config.workspaceRoot,
    );

    expect(report.divergences.length).toBeGreaterThan(0);
    const entry = report.divergences.find((d) => d.stepName === "pr-intake");
    expect(entry).toBeDefined();
    expect(entry?.field).toBe("status");
    expect(entry?.dbValue).toBe("completed");
    expect(entry?.fileValue).toBe("in_progress");
  });

  it("reports missing progress file when DB has a record", async () => {
    const workspace = await registerWorkspace();
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await writeStepHandoverFromConfig(config, {
      stepName: "pr-intake",
      status: "completed",
      summary: "PR intake done",
      nextStep: "discover-context",
    });

    // Delete the progress file
    const { rm } = await import("node:fs/promises");
    const filePath = resolve(config.paths.progressDirectory, "02-pr-intake.md");
    await rm(filePath);

    const report = await detectProgressDivergence(
      config.paths.database,
      config.workspaceRoot,
    );

    expect(report.divergences.length).toBeGreaterThan(0);
    const entry = report.divergences.find((d) => d.stepName === "pr-intake");
    expect(entry).toBeDefined();
    expect(entry?.field).toBe("file_missing");
  });

  it("handles steps with no DB record and no file gracefully", async () => {
    const workspace = await registerWorkspace();
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    // Only setup step is written by initializeWorkspace
    const report = await detectProgressDivergence(
      config.paths.database,
      config.workspaceRoot,
    );

    // Steps without DB record and without file should not be reported
    const prIntake = report.divergences.find((d) => d.stepName === "pr-intake");
    expect(prIntake).toBeUndefined();
  });
});
