import { afterEach, describe, expect, it } from "vitest";

import {
  findSession,
  listObservations,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { runAssessGapsFromMapping } from "../../src/exploratory-testing/tools/assess-gaps";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
import { runGenerateChartersFromAssessment } from "../../src/exploratory-testing/tools/generate-charters";
import { runMapTestsFromAnalysis } from "../../src/exploratory-testing/tools/map-tests";
import { readStepHandoverDocument } from "../../src/exploratory-testing/tools/progress";
import {
  addSessionObservation,
  completeSession,
  interruptSession,
  startSession,
} from "../../src/exploratory-testing/tools/run-session";
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
    linkedIssues: [],
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
    ],
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

describe("run-session tool", () => {
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

  async function seedThroughCharters(
    workspace: TestWorkspace & { databasePath: string },
  ): Promise<{
    sessionChartersId: number;
    databasePath: string;
  }> {
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    const assessResult = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );
    const charterResult = await runGenerateChartersFromAssessment(
      assessResult.persisted,
      mappingResult.persisted.coverageGapMap,
      config,
    );

    return {
      sessionChartersId: charterResult.persisted.id,
      databasePath: workspace.databasePath,
    };
  }

  it("starts a session from a charter", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = await seedThroughCharters(workspace);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await startSession({
      sessionChartersId,
      charterIndex: 0,
      config,
    });

    expect(result.session.status).toBe("in_progress");
    expect(result.session.charterIndex).toBe(0);
    expect(result.session.startedAt).not.toBeNull();

    // Verify in DB
    const dbSession = findSession(workspace.databasePath, result.session.id);
    expect(dbSession?.status).toBe("in_progress");
  });

  it("adds observations to a session", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = await seedThroughCharters(workspace);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const { session } = await startSession({
      sessionChartersId,
      charterIndex: 0,
      config,
    });

    const obs = await addSessionObservation({
      sessionId: session.id,
      targetedHeuristic: "error-guessing",
      action: "Submit empty form",
      expected: "Validation error shown",
      actual: "Validation error shown",
      outcome: "pass",
      note: "Works correctly",
      evidencePath: null,
      config,
    });

    expect(obs.observation.observationOrder).toBe(1);
    expect(obs.observation.outcome).toBe("pass");

    const observations = listObservations(workspace.databasePath, session.id);
    expect(observations).toHaveLength(1);
  });

  it("interrupts a session with reason and writes handover", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = await seedThroughCharters(workspace);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const { session } = await startSession({
      sessionChartersId,
      charterIndex: 0,
      config,
    });

    const result = await interruptSession({
      sessionId: session.id,
      reason: "Environment went down",
      config,
    });

    expect(result.session.status).toBe("interrupted");
    expect(result.session.interruptReason).toBe("Environment went down");
    expect(result.handover.snapshot.status).toBe("interrupted");
  });

  it("completes a session and writes handover", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = await seedThroughCharters(workspace);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const { session } = await startSession({
      sessionChartersId,
      charterIndex: 0,
      config,
    });

    await addSessionObservation({
      sessionId: session.id,
      targetedHeuristic: "error-guessing",
      action: "Submit empty form",
      expected: "Error shown",
      actual: "Error shown",
      outcome: "pass",
      note: "",
      evidencePath: null,
      config,
    });

    const result = await completeSession({
      sessionId: session.id,
      config,
    });

    expect(result.session.status).toBe("completed");
    expect(result.session.completedAt).not.toBeNull();
    expect(result.handover.snapshot.status).toBe("in_progress");

    const handover = await readStepHandoverDocument(result.handover.filePath);
    expect(handover.body).toContain("Session");
  });

  it("resumes an interrupted session", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = await seedThroughCharters(workspace);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const { session } = await startSession({
      sessionChartersId,
      charterIndex: 0,
      config,
    });

    await interruptSession({
      sessionId: session.id,
      reason: "Break",
      config,
    });

    // Resume by starting again with same charter
    const resumed = await startSession({
      sessionChartersId,
      charterIndex: 0,
      config,
    });

    expect(resumed.session.status).toBe("in_progress");
    expect(resumed.session.id).toBe(session.id);
    // Stale interrupt fields should be cleared on resume
    expect(resumed.session.interruptedAt).toBeNull();
    expect(resumed.session.interruptReason).toBeNull();
  });
});
