import { afterEach, describe, expect, it } from "vitest";

import {
  findSession,
  listObservations,
  listSessionsByChartersId,
  saveChangeAnalysis,
  saveObservation,
  savePrIntake,
  saveRiskAssessment,
  saveSession,
  saveSessionCharters,
  saveTestMapping,
  updateSessionStatus,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { ChangeAnalysisResult } from "../../src/exploratory-testing/models/change-analysis";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import type { RiskAssessmentResult } from "../../src/exploratory-testing/models/risk-assessment";
import type { SessionCharterGenerationResult } from "../../src/exploratory-testing/models/session-charter";
import type { TestMappingResult } from "../../src/exploratory-testing/models/test-mapping";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

function createSamplePrMetadata(): PrMetadata {
  return {
    provider: "github",
    repository: "owner/repo",
    prNumber: 42,
    title: "Add user auth",
    description: "Implements authentication",
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
    ],
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

function seedAllDependencies(databasePath: string): {
  sessionChartersId: number;
} {
  const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
  const changeAnalysis = saveChangeAnalysis(databasePath, {
    prIntakeId: prIntake.id,
    fileAnalyses: [
      {
        path: "src/middleware/auth.ts",
        status: "modified",
        additions: 30,
        deletions: 5,
        categories: [
          { category: "permission", confidence: 0.9, reason: "Auth module" },
        ],
      },
    ],
    relatedCodes: [],
    viewpointSeeds: [],
    summary: "1 file analyzed",
    analyzedAt: "2026-04-01T00:00:00Z",
  } satisfies ChangeAnalysisResult);
  const testMapping = saveTestMapping(databasePath, {
    prIntakeId: prIntake.id,
    changeAnalysisId: changeAnalysis.id,
    testAssets: [],
    testSummaries: [],
    coverageGapMap: [],
    missingLayers: [],
    mappedAt: "2026-04-01T00:00:00Z",
  } satisfies TestMappingResult);
  const riskAssessment = saveRiskAssessment(databasePath, {
    testMappingId: testMapping.id,
    riskScores: [],
    frameworkSelections: [],
    explorationThemes: [],
    assessedAt: "2026-04-01T00:00:00Z",
  } satisfies RiskAssessmentResult);
  const sessionCharters = saveSessionCharters(databasePath, {
    riskAssessmentId: riskAssessment.id,
    charters: [
      {
        title: "Auth error handling",
        goal: "Verify error responses",
        scope: ["src/middleware/auth.ts"],
        selectedFrameworks: ["error-guessing"],
        preconditions: [],
        observationTargets: [
          { category: "network", description: "Check responses" },
        ],
        stopConditions: ["All tested"],
        timeboxMinutes: 20,
      },
      {
        title: "Boundary validation",
        goal: "Test input boundaries",
        scope: ["src/middleware/auth.ts"],
        selectedFrameworks: ["boundary-value-analysis"],
        preconditions: [],
        observationTargets: [
          { category: "ui", description: "Check form validation" },
        ],
        stopConditions: ["All boundaries tested"],
        timeboxMinutes: 15,
      },
    ],
    generatedAt: "2026-04-01T00:00:00Z",
  } satisfies SessionCharterGenerationResult);

  return { sessionChartersId: sessionCharters.id };
}

describe("session repository", () => {
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

  it("creates a session in planned status", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = seedAllDependencies(workspace.databasePath);

    const session = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });

    expect(session.id).toBeGreaterThan(0);
    expect(session.sessionChartersId).toBe(sessionChartersId);
    expect(session.charterIndex).toBe(0);
    expect(session.charterTitle).toBe("Auth error handling");
    expect(session.status).toBe("planned");
    expect(session.startedAt).toBeNull();
    expect(session.interruptedAt).toBeNull();
    expect(session.completedAt).toBeNull();
    expect(session.interruptReason).toBeNull();
  });

  it("retrieves a session by id", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = seedAllDependencies(workspace.databasePath);

    const saved = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });

    const found = findSession(workspace.databasePath, saved.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(saved.id);
    expect(found?.status).toBe("planned");
  });

  it("returns null for non-existent session", async () => {
    const workspace = await setupWorkspace();
    const found = findSession(workspace.databasePath, 999);
    expect(found).toBeNull();
  });

  it("lists sessions by session_charters_id", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = seedAllDependencies(workspace.databasePath);

    saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });
    saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 1,
      charterTitle: "Boundary validation",
    });

    const sessions = listSessionsByChartersId(
      workspace.databasePath,
      sessionChartersId,
    );
    expect(sessions).toHaveLength(2);
    expect(sessions[0].charterIndex).toBe(0);
    expect(sessions[1].charterIndex).toBe(1);
  });

  it("updates session status to in_progress", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = seedAllDependencies(workspace.databasePath);

    const session = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });

    const updated = updateSessionStatus(workspace.databasePath, {
      sessionId: session.id,
      status: "in_progress",
      startedAt: "2026-04-01T10:00:00Z",
    });

    expect(updated.status).toBe("in_progress");
    expect(updated.startedAt).toBe("2026-04-01T10:00:00Z");
  });

  it("updates session status to interrupted with reason", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = seedAllDependencies(workspace.databasePath);

    const session = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });
    updateSessionStatus(workspace.databasePath, {
      sessionId: session.id,
      status: "in_progress",
      startedAt: "2026-04-01T10:00:00Z",
    });

    const interrupted = updateSessionStatus(workspace.databasePath, {
      sessionId: session.id,
      status: "interrupted",
      interruptedAt: "2026-04-01T10:15:00Z",
      interruptReason: "Environment went down",
    });

    expect(interrupted.status).toBe("interrupted");
    expect(interrupted.interruptedAt).toBe("2026-04-01T10:15:00Z");
    expect(interrupted.interruptReason).toBe("Environment went down");
  });

  it("updates session status to completed", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = seedAllDependencies(workspace.databasePath);

    const session = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });
    updateSessionStatus(workspace.databasePath, {
      sessionId: session.id,
      status: "in_progress",
      startedAt: "2026-04-01T10:00:00Z",
    });

    const completed = updateSessionStatus(workspace.databasePath, {
      sessionId: session.id,
      status: "completed",
      completedAt: "2026-04-01T10:20:00Z",
    });

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe("2026-04-01T10:20:00Z");
  });

  it("is idempotent for same charter index", async () => {
    const workspace = await setupWorkspace();
    const { sessionChartersId } = seedAllDependencies(workspace.databasePath);

    const first = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });
    const second = saveSession(workspace.databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling (updated)",
    });

    expect(first.id).toBe(second.id);
    expect(second.charterTitle).toBe("Auth error handling (updated)");
  });
});

describe("observation repository", () => {
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

  function seedSession(databasePath: string): { sessionId: number } {
    const { sessionChartersId } = seedAllDependencies(databasePath);
    const session = saveSession(databasePath, {
      sessionChartersId,
      charterIndex: 0,
      charterTitle: "Auth error handling",
    });
    return { sessionId: session.id };
  }

  it("saves and retrieves an observation", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSession(workspace.databasePath);

    const observation = saveObservation(workspace.databasePath, {
      sessionId,
      targetedHeuristic: "boundary-value",
      action: "Enter max length + 1 chars",
      expected: "Validation error",
      actual: "Validation error shown",
      outcome: "pass",
      note: "Works correctly",
      evidencePath: "evidence/screenshot-01.png",
    });

    expect(observation.id).toBeGreaterThan(0);
    expect(observation.sessionId).toBe(sessionId);
    expect(observation.observationOrder).toBe(1);
    expect(observation.targetedHeuristic).toBe("boundary-value");
    expect(observation.outcome).toBe("pass");
    expect(observation.evidencePath).toBe("evidence/screenshot-01.png");
  });

  it("auto-increments observation_order within a session", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSession(workspace.databasePath);

    const first = saveObservation(workspace.databasePath, {
      sessionId,
      targetedHeuristic: "error-guessing",
      action: "Submit empty form",
      expected: "Error message",
      actual: "Error message shown",
      outcome: "pass",
      note: "",
      evidencePath: null,
    });

    const second = saveObservation(workspace.databasePath, {
      sessionId,
      targetedHeuristic: "boundary-value",
      action: "Enter very long input",
      expected: "Truncation or error",
      actual: "Application crashed",
      outcome: "fail",
      note: "Possible bug: no length validation",
      evidencePath: "evidence/crash-log.txt",
    });

    expect(first.observationOrder).toBe(1);
    expect(second.observationOrder).toBe(2);
  });

  it("lists observations for a session in order", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSession(workspace.databasePath);

    saveObservation(workspace.databasePath, {
      sessionId,
      targetedHeuristic: "error-guessing",
      action: "Action 1",
      expected: "Expected 1",
      actual: "Actual 1",
      outcome: "pass",
      note: "",
      evidencePath: null,
    });
    saveObservation(workspace.databasePath, {
      sessionId,
      targetedHeuristic: "boundary-value",
      action: "Action 2",
      expected: "Expected 2",
      actual: "Actual 2",
      outcome: "suspicious",
      note: "Needs investigation",
      evidencePath: null,
    });

    const observations = listObservations(workspace.databasePath, sessionId);
    expect(observations).toHaveLength(2);
    expect(observations[0].observationOrder).toBe(1);
    expect(observations[1].observationOrder).toBe(2);
    expect(observations[1].outcome).toBe("suspicious");
  });

  it("returns empty array when no observations exist", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSession(workspace.databasePath);

    const observations = listObservations(workspace.databasePath, sessionId);
    expect(observations).toHaveLength(0);
  });

  it("accepts observation with null evidencePath", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedSession(workspace.databasePath);

    const observation = saveObservation(workspace.databasePath, {
      sessionId,
      targetedHeuristic: "error-guessing",
      action: "Do something",
      expected: "Something happens",
      actual: "Something happened",
      outcome: "pass",
      note: "",
      evidencePath: null,
    });

    expect(observation.evidencePath).toBeNull();
  });
});
