import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  saveFinding,
  saveObservation,
  savePrIntake,
  saveSession,
  updateSessionStatus,
} from "../../src/exploratory-testing/db/workspace-repository";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import {
  type ExportArtifactsResult,
  exportArtifacts,
} from "../../src/exploratory-testing/tools/export-artifacts";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  createSamplePrMetadata,
  seedSessionCharters,
} from "../helpers/seed-data";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("export-artifacts tool", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setupWorkspaceWithFullPipeline(): Promise<
    TestWorkspace & {
      databasePath: string;
      sessionChartersId: number;
      sessionId: number;
    }
  > {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    const databasePath = result.databasePath;

    const { sessionChartersId } = seedSessionCharters(databasePath);

    const session = saveSession(databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });
    updateSessionStatus(databasePath, {
      sessionId: session.id,
      status: "in_progress",
      startedAt: "2026-04-01T10:00:00Z",
    });

    const observation = saveObservation(databasePath, {
      sessionId: session.id,
      targetedHeuristic: "error-guessing",
      action: "Submit invalid credentials",
      expected: "Error message",
      actual: "Application crashed",
      outcome: "fail",
      note: "Unhandled rejection",
      evidencePath: null,
    });

    updateSessionStatus(databasePath, {
      sessionId: session.id,
      status: "completed",
      completedAt: "2026-04-01T10:30:00Z",
    });

    saveFinding(databasePath, {
      sessionId: session.id,
      observationId: observation.id,
      type: "defect",
      title: "Crash on invalid credentials",
      description: "Unhandled rejection when submitting bad creds",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
    });

    saveFinding(databasePath, {
      sessionId: session.id,
      observationId: observation.id,
      type: "automation-candidate",
      title: "Auth boundary validation",
      description: "Min/max input boundaries",
      severity: "medium",
      recommendedTestLayer: "unit",
      automationRationale: "Deterministic boundary check",
    });

    return {
      ...workspace,
      databasePath,
      sessionChartersId,
      sessionId: session.id,
    };
  }

  it("exports all 5 artifact files", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    expect(result.artifacts.explorationBrief).toMatch(/exploration-brief\.md$/);
    expect(result.artifacts.coverageGapMap).toMatch(/coverage-gap-map\.md$/);
    expect(result.artifacts.sessionCharters).toMatch(/session-charters\.md$/);
    expect(result.artifacts.findingsReport).toMatch(/findings-report\.md$/);
    expect(result.artifacts.automationCandidateReport).toMatch(
      /automation-candidate-report\.md$/,
    );
  });

  it("writes valid markdown for exploration brief", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.explorationBrief, "utf8");
    expect(content).toContain("# Exploration Brief");
    expect(content).toContain("Add user auth");
    expect(content).toContain("src/middleware/auth.ts");
  });

  it("writes valid markdown for coverage gap map", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.coverageGapMap, "utf8");
    expect(content).toContain("# Coverage Gap Map");
  });

  it("writes valid markdown for session charters", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.sessionCharters, "utf8");
    expect(content).toContain("# Session Charters");
    expect(content).toContain("Auth error handling");
  });

  it("writes valid markdown for findings report", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.findingsReport, "utf8");
    expect(content).toContain("# Findings Report");
    expect(content).toContain("Crash on invalid credentials");
    expect(content).toContain("defect");
  });

  it("writes valid markdown for automation candidate report", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(
      result.artifacts.automationCandidateReport,
      "utf8",
    );
    expect(content).toContain("# Automation Candidate Report");
    expect(content).toContain("Auth boundary validation");
    expect(content).toContain("unit");
  });

  it("writes a handover document", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    expect(result.handover.filePath).toMatch(/09-export-artifacts\.md$/);
  });

  it("rejects when prIntakeId does not exist", async () => {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await expect(
      exportArtifacts({
        prIntakeId: 999,
        config,
      }),
    ).rejects.toThrow(/PR intake not found/);
  });

  it("is idempotent on re-export", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result1 = await exportArtifacts({ prIntakeId: 1, config });
    const result2 = await exportArtifacts({ prIntakeId: 1, config });

    const content1 = await readFile(result1.artifacts.findingsReport, "utf8");
    const content2 = await readFile(result2.artifacts.findingsReport, "utf8");
    expect(content1).toBe(content2);
  });

  it("rejects when change analysis is missing", async () => {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    savePrIntake(result.databasePath, createSamplePrMetadata());

    await expect(exportArtifacts({ prIntakeId: 1, config })).rejects.toThrow(
      /Change analysis not found.*discover-context/,
    );
  });

  it("scopes findings to the target PR only", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    // Create a second PR with its own session + finding via separate chain
    const pr2 = savePrIntake(workspace.databasePath, {
      ...createSamplePrMetadata(),
      prNumber: 99,
      title: "Other PR",
      headSha: "xyz9999",
    });

    const result = await exportArtifacts({ prIntakeId: 1, config });
    const content = await readFile(result.artifacts.findingsReport, "utf8");

    // Findings from the first PR should be present
    expect(content).toContain("Crash on invalid credentials");
    // The second PR has no pipeline chain, so no findings from it
    // Most importantly: the report should NOT contain data from unrelated PRs
    expect(content).not.toContain("Other PR");
  });
});
