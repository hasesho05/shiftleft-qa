import { afterEach, describe, expect, it } from "vitest";

import {
  findPrIntakeById,
  listAllFindings,
  listAllSessions,
  saveFinding,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  createSamplePrMetadata,
  seedSessionWithObservation,
} from "../helpers/seed-data";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("export-related repository functions", () => {
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

  describe("findPrIntakeById", () => {
    it("returns a PR intake by its ID", async () => {
      const workspace = await setupWorkspace();
      const metadata = createSamplePrMetadata();
      const saved = savePrIntake(workspace.databasePath, metadata);

      const found = findPrIntakeById(workspace.databasePath, saved.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(saved.id);
      expect(found?.prNumber).toBe(42);
    });

    it("returns null for a non-existent ID", async () => {
      const workspace = await setupWorkspace();

      const found = findPrIntakeById(workspace.databasePath, 999);

      expect(found).toBeNull();
    });
  });

  describe("listAllSessions", () => {
    it("returns all sessions across charters", async () => {
      const workspace = await setupWorkspace();
      const { sessionId } = seedSessionWithObservation(workspace.databasePath);

      const sessions = listAllSessions(workspace.databasePath);

      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe(sessionId);
    });

    it("returns empty array when no sessions exist", async () => {
      const workspace = await setupWorkspace();

      const sessions = listAllSessions(workspace.databasePath);

      expect(sessions).toEqual([]);
    });
  });

  describe("listAllFindings", () => {
    it("returns all findings across sessions", async () => {
      const workspace = await setupWorkspace();
      const { sessionId, observationId } = seedSessionWithObservation(
        workspace.databasePath,
      );

      saveFinding(workspace.databasePath, {
        sessionId,
        observationId,
        type: "defect",
        title: "Bug A",
        description: "Description A",
        severity: "high",
        recommendedTestLayer: null,
        automationRationale: null,
      });

      saveFinding(workspace.databasePath, {
        sessionId,
        observationId,
        type: "automation-candidate",
        title: "Auto B",
        description: "Description B",
        severity: "medium",
        recommendedTestLayer: "unit",
        automationRationale: "Easy to automate",
      });

      const findings = listAllFindings(workspace.databasePath);

      expect(findings.length).toBe(2);
      expect(findings[0].title).toBe("Bug A");
      expect(findings[1].title).toBe("Auto B");
    });

    it("returns empty array when no findings exist", async () => {
      const workspace = await setupWorkspace();

      const findings = listAllFindings(workspace.databasePath);

      expect(findings).toEqual([]);
    });
  });
});
