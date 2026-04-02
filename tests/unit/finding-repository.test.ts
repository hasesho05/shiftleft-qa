import { afterEach, describe, expect, it } from "vitest";

import {
  listFindings,
  listFindingsByType,
  saveFinding,
} from "../../src/exploratory-testing/db/workspace-repository";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import { seedSessionWithObservation } from "../helpers/seed-data";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("finding repository", () => {
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

  it("saves and retrieves a defect finding", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );

    const finding = saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "defect",
      title: "Crash on invalid credentials",
      description: "Unhandled rejection when submitting bad creds",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
    });

    expect(finding.id).toBeGreaterThan(0);
    expect(finding.sessionId).toBe(sessionId);
    expect(finding.observationId).toBe(observationId);
    expect(finding.type).toBe("defect");
    expect(finding.severity).toBe("high");
    expect(finding.recommendedTestLayer).toBeNull();
    expect(finding.automationRationale).toBeNull();
  });

  it("saves an automation-candidate finding with test layer", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );

    const finding = saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "automation-candidate",
      title: "Boundary validation for input field",
      description: "Min/max boundary values should be automated",
      severity: "medium",
      recommendedTestLayer: "unit",
      automationRationale: "Deterministic boundary check",
    });

    expect(finding.type).toBe("automation-candidate");
    expect(finding.recommendedTestLayer).toBe("unit");
    expect(finding.automationRationale).toBe("Deterministic boundary check");
  });

  it("saves a spec-gap finding", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );

    const finding = saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "spec-gap",
      title: "No spec for concurrent edits",
      description: "Behavior undefined for concurrent edit scenario",
      severity: "medium",
      recommendedTestLayer: null,
      automationRationale: null,
    });

    expect(finding.type).toBe("spec-gap");
  });

  it("lists all findings for a session", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );

    saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "defect",
      title: "Bug 1",
      description: "Description 1",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
    });
    saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "spec-gap",
      title: "Gap 1",
      description: "Description 2",
      severity: "medium",
      recommendedTestLayer: null,
      automationRationale: null,
    });

    const findings = listFindings(workspace.databasePath, sessionId);
    expect(findings).toHaveLength(2);
    expect(findings[0].type).toBe("defect");
    expect(findings[1].type).toBe("spec-gap");
  });

  it("lists findings filtered by type", async () => {
    const workspace = await setupWorkspace();
    const { sessionId, observationId } = seedSessionWithObservation(
      workspace.databasePath,
    );

    saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "defect",
      title: "Bug 1",
      description: "Description 1",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
    });
    saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "automation-candidate",
      title: "Automate this",
      description: "Can be automated",
      severity: "low",
      recommendedTestLayer: "e2e",
      automationRationale: "E2E flow test",
    });
    saveFinding(workspace.databasePath, {
      sessionId,
      observationId,
      type: "automation-candidate",
      title: "Automate that",
      description: "Also can be automated",
      severity: "medium",
      recommendedTestLayer: "unit",
      automationRationale: "Unit boundary test",
    });

    const automationCandidates = listFindingsByType(
      workspace.databasePath,
      sessionId,
      "automation-candidate",
    );
    expect(automationCandidates).toHaveLength(2);
    expect(automationCandidates[0].type).toBe("automation-candidate");
    expect(automationCandidates[1].type).toBe("automation-candidate");

    const defects = listFindingsByType(
      workspace.databasePath,
      sessionId,
      "defect",
    );
    expect(defects).toHaveLength(1);
  });

  it("returns empty array when no findings exist", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSessionWithObservation(workspace.databasePath);

    const findings = listFindings(workspace.databasePath, sessionId);
    expect(findings).toHaveLength(0);
  });
});
