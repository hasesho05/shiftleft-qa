import { afterEach, describe, expect, it } from "vitest";

import {
  saveSession,
  updateSessionStatus,
} from "../../src/exploratory-testing/db/workspace-repository";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  addFinding,
  generateAutomationReport,
  generateTriageReport,
} from "../../src/exploratory-testing/tools/triage-findings";
import {
  seedSessionCharters,
  seedSessionWithObservation,
} from "../helpers/seed-data";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("triage-findings tool", () => {
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

  it("adds a defect finding from an observation", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await addFinding({
      sessionId,
      observationId,
      type: "defect",
      title: "Crash on invalid credentials",
      description: "Unhandled rejection when submitting bad creds",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
      config,
    });

    expect(result.finding.id).toBeGreaterThan(0);
    expect(result.finding.type).toBe("defect");
    expect(result.finding.severity).toBe("high");
  });

  it("adds an automation-candidate finding with test layer", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await addFinding({
      sessionId,
      observationId,
      type: "automation-candidate",
      title: "Boundary value validation",
      description: "Min/max input boundaries should be tested automatically",
      severity: "medium",
      recommendedTestLayer: "unit",
      automationRationale: "Deterministic boundary check, easy to automate",
      config,
    });

    expect(result.finding.type).toBe("automation-candidate");
    expect(result.finding.recommendedTestLayer).toBe("unit");
    expect(result.finding.automationRationale).toBe(
      "Deterministic boundary check, easy to automate",
    );
  });

  it("rejects finding for non-existent session", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await expect(
      addFinding({
        sessionId: 999,
        observationId: 1,
        type: "defect",
        title: "Test",
        description: "Test",
        severity: "low",
        recommendedTestLayer: null,
        automationRationale: null,
        config,
      }),
    ).rejects.toThrow(/Session not found/);
  });

  it("rejects finding for non-existent observation", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSessionWithObservation(workspace.databasePath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await expect(
      addFinding({
        sessionId,
        observationId: 999,
        type: "defect",
        title: "Test",
        description: "Test",
        severity: "low",
        recommendedTestLayer: null,
        automationRationale: null,
        config,
      }),
    ).rejects.toThrow(/Observation not found/);
  });

  it("rejects finding when observation belongs to different session", async () => {
    const workspace = await setupWorkspace();
    // First session with observation
    const { sessionId: firstSessionId, observationId } =
      seedSessionWithObservation(workspace.databasePath);
    // Second session from the same charters but different charter index
    const { sessionChartersId } = seedSessionCharters(workspace.databasePath);
    const secondSession = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 99,
      charterTitle: "Different session",
    });
    updateSessionStatus(workspace.databasePath, {
      sessionId: secondSession.id,
      status: "in_progress",
      startedAt: "2026-04-01T11:00:00Z",
    });
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    // observationId belongs to firstSessionId, not secondSession.id
    expect(secondSession.id).not.toBe(firstSessionId);
    await expect(
      addFinding({
        sessionId: secondSession.id,
        observationId, // belongs to first session
        type: "defect",
        title: "Test",
        description: "Test",
        severity: "low",
        recommendedTestLayer: null,
        automationRationale: null,
        config,
      }),
    ).rejects.toThrow(/belongs to session/);
  });

  it("generates a triage report for a session", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await addFinding({
      sessionId,
      observationId,
      type: "defect",
      title: "Crash on invalid creds",
      description: "App crashes on bad login",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
      config,
    });
    await addFinding({
      sessionId,
      observationId,
      type: "spec-gap",
      title: "Missing concurrent edit spec",
      description: "No defined behavior for concurrent edits",
      severity: "medium",
      recommendedTestLayer: null,
      automationRationale: null,
      config,
    });
    await addFinding({
      sessionId,
      observationId,
      type: "automation-candidate",
      title: "Boundary check",
      description: "Automate boundary validation",
      severity: "low",
      recommendedTestLayer: "unit",
      automationRationale: "Simple boundary test",
      config,
    });

    const report = await generateTriageReport({
      sessionId,
      config,
    });

    expect(report.totalFindings).toBe(3);
    expect(report.countByType.defect).toBe(1);
    expect(report.countByType["spec-gap"]).toBe(1);
    expect(report.countByType["automation-candidate"]).toBe(1);
    expect(report.countBySeverity.high).toBe(1);
    expect(report.countBySeverity.medium).toBe(1);
    expect(report.countBySeverity.low).toBe(1);
    expect(report.findings).toHaveLength(3);
  });

  it("generates an automation candidate report", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await addFinding({
      sessionId,
      observationId,
      type: "automation-candidate",
      title: "Boundary check",
      description: "Automate boundary validation",
      severity: "medium",
      recommendedTestLayer: "unit",
      automationRationale: "Simple boundary test",
      config,
    });
    await addFinding({
      sessionId,
      observationId,
      type: "automation-candidate",
      title: "E2E login flow",
      description: "Automate login flow",
      severity: "high",
      recommendedTestLayer: "e2e",
      automationRationale: "Critical user flow",
      config,
    });
    await addFinding({
      sessionId,
      observationId,
      type: "defect",
      title: "Bug - not automation",
      description: "This is a bug",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
      config,
    });

    const report = await generateAutomationReport({
      sessionId,
      config,
    });

    expect(report.totalCandidates).toBe(2);
    expect(report.candidates).toHaveLength(2);
    expect(report.countByLayer.unit).toBe(1);
    expect(report.countByLayer.e2e).toBe(1);
  });

  it("triage report returns zeros when no findings", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSessionWithObservation(workspace.databasePath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const report = await generateTriageReport({
      sessionId,
      config,
    });

    expect(report.totalFindings).toBe(0);
    expect(report.countByType.defect).toBe(0);
    expect(report.findings).toHaveLength(0);
  });
});
