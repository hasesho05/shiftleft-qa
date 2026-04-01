import { afterEach, describe, expect, it } from "vitest";

import {
  findSessionCharters,
  saveChangeAnalysis,
  savePrIntake,
  saveRiskAssessment,
  saveSessionCharters,
  saveTestMapping,
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

function createSampleChangeAnalysis(prIntakeId: number): ChangeAnalysisResult {
  return {
    prIntakeId,
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
  };
}

function createSampleTestMapping(
  prIntakeId: number,
  changeAnalysisId: number,
): TestMappingResult {
  return {
    prIntakeId,
    changeAnalysisId,
    testAssets: [],
    testSummaries: [],
    coverageGapMap: [],
    missingLayers: [],
    mappedAt: "2026-04-01T00:00:00Z",
  };
}

function createSampleRiskAssessment(
  testMappingId: number,
): RiskAssessmentResult {
  return {
    testMappingId,
    riskScores: [
      {
        changedFilePath: "src/middleware/auth.ts",
        overallRisk: 0.8,
        factors: [{ factor: "permission", weight: 0.5, contribution: 0.4 }],
      },
    ],
    frameworkSelections: [
      {
        framework: "error-guessing",
        reason: "Auth module may have edge cases",
        relevantFiles: ["src/middleware/auth.ts"],
        priority: "high",
      },
    ],
    explorationThemes: [
      {
        title: "Auth error handling",
        description: "Test error paths in auth middleware",
        frameworks: ["error-guessing"],
        targetFiles: ["src/middleware/auth.ts"],
        riskLevel: "high",
        estimatedMinutes: 20,
      },
    ],
    assessedAt: "2026-04-01T00:00:00Z",
  };
}

function createSampleSessionCharters(
  riskAssessmentId: number,
): SessionCharterGenerationResult {
  return {
    riskAssessmentId,
    charters: [
      {
        title: "Auth error handling",
        goal: "Verify error responses for invalid tokens",
        scope: ["src/middleware/auth.ts"],
        selectedFrameworks: ["error-guessing"],
        preconditions: ["Server is running"],
        observationTargets: [
          { category: "network", description: "Check 401 responses" },
          { category: "console", description: "Watch for errors" },
        ],
        stopConditions: [
          "All error conditions tested",
          "A blocking defect is found",
        ],
        timeboxMinutes: 20,
      },
    ],
    generatedAt: "2026-04-01T00:00:00Z",
  };
}

describe("session charter repository", () => {
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

  function seedDependencies(databasePath: string): {
    riskAssessmentId: number;
  } {
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
    const changeAnalysis = saveChangeAnalysis(
      databasePath,
      createSampleChangeAnalysis(prIntake.id),
    );
    const testMapping = saveTestMapping(
      databasePath,
      createSampleTestMapping(prIntake.id, changeAnalysis.id),
    );
    const riskAssessment = saveRiskAssessment(
      databasePath,
      createSampleRiskAssessment(testMapping.id),
    );
    return { riskAssessmentId: riskAssessment.id };
  }

  it("saves and retrieves session charters", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedDependencies(workspace.databasePath);

    const charterResult = createSampleSessionCharters(riskAssessmentId);
    const persisted = saveSessionCharters(
      workspace.databasePath,
      charterResult,
    );

    expect(persisted.id).toBeGreaterThan(0);
    expect(persisted.riskAssessmentId).toBe(riskAssessmentId);
    expect(persisted.charters).toHaveLength(1);
    expect(persisted.charters[0].title).toBe("Auth error handling");

    const retrieved = findSessionCharters(
      workspace.databasePath,
      riskAssessmentId,
    );
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(persisted.id);
    expect(retrieved?.charters).toEqual(persisted.charters);
  });

  it("returns null when no charters exist", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedDependencies(workspace.databasePath);

    const result = findSessionCharters(
      workspace.databasePath,
      riskAssessmentId,
    );
    expect(result).toBeNull();
  });

  it("is idempotent — updates on conflict", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedDependencies(workspace.databasePath);

    const first = saveSessionCharters(
      workspace.databasePath,
      createSampleSessionCharters(riskAssessmentId),
    );

    const updated = createSampleSessionCharters(riskAssessmentId);
    updated.charters[0] = {
      ...updated.charters[0],
      title: "Updated charter title",
    };

    const second = saveSessionCharters(workspace.databasePath, updated);
    expect(second.id).toBe(first.id);
    expect(second.charters[0].title).toBe("Updated charter title");
  });

  it("validates charters JSON on retrieval with Zod", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedDependencies(workspace.databasePath);

    saveSessionCharters(
      workspace.databasePath,
      createSampleSessionCharters(riskAssessmentId),
    );

    const retrieved = findSessionCharters(
      workspace.databasePath,
      riskAssessmentId,
    );
    expect(retrieved).not.toBeNull();

    // Each charter should have all required fields
    for (const charter of retrieved?.charters ?? []) {
      expect(charter.title.length).toBeGreaterThan(0);
      expect(charter.scope.length).toBeGreaterThan(0);
      expect(charter.selectedFrameworks.length).toBeGreaterThan(0);
      expect(charter.observationTargets.length).toBeGreaterThan(0);
      expect(charter.timeboxMinutes).toBeGreaterThan(0);
    }
  });
});
