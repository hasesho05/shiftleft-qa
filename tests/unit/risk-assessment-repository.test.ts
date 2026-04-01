import { afterEach, describe, expect, it } from "vitest";

import {
  findRiskAssessment,
  saveChangeAnalysis,
  savePrIntake,
  saveRiskAssessment,
  saveTestMapping,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { ChangeAnalysisResult } from "../../src/exploratory-testing/models/change-analysis";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import type { RiskAssessmentResult } from "../../src/exploratory-testing/models/risk-assessment";
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
        factors: [
          { factor: "uncovered-aspects", weight: 0.4, contribution: 0.32 },
          { factor: "change-magnitude", weight: 0.3, contribution: 0.09 },
          { factor: "category-risk", weight: 0.3, contribution: 0.27 },
        ],
      },
    ],
    frameworkSelections: [
      {
        framework: "error-guessing",
        reason: "Permission changes are prone to edge-case failures",
        relevantFiles: ["src/middleware/auth.ts"],
        priority: "high",
      },
    ],
    explorationThemes: [
      {
        title: "Error Guessing: auth.ts",
        description: "Permission changes are prone to edge-case failures",
        frameworks: ["error-guessing"],
        targetFiles: ["src/middleware/auth.ts"],
        riskLevel: "high",
        estimatedMinutes: 20,
      },
    ],
    assessedAt: "2026-04-01T00:00:00Z",
  };
}

describe("risk assessment repository", () => {
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

  function seedPrerequisites(databasePath: string): {
    prIntakeId: number;
    changeAnalysisId: number;
    testMappingId: number;
  } {
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
    const analysis = saveChangeAnalysis(
      databasePath,
      createSampleChangeAnalysis(prIntake.id),
    );
    const mapping = saveTestMapping(
      databasePath,
      createSampleTestMapping(prIntake.id, analysis.id),
    );
    return {
      prIntakeId: prIntake.id,
      changeAnalysisId: analysis.id,
      testMappingId: mapping.id,
    };
  }

  it("saves and retrieves a risk assessment record", async () => {
    const workspace = await setupWorkspace();
    const { testMappingId } = seedPrerequisites(workspace.databasePath);
    const assessment = createSampleRiskAssessment(testMappingId);

    const persisted = saveRiskAssessment(workspace.databasePath, assessment);

    expect(persisted.testMappingId).toBe(testMappingId);
    expect(persisted.riskScores).toHaveLength(1);
    expect(persisted.frameworkSelections).toHaveLength(1);
    expect(persisted.explorationThemes).toHaveLength(1);

    const found = findRiskAssessment(workspace.databasePath, testMappingId);
    expect(found).not.toBeNull();
    expect(found?.riskScores[0].overallRisk).toBe(0.8);
  });

  it("returns null when no risk assessment found", async () => {
    const workspace = await setupWorkspace();

    const found = findRiskAssessment(workspace.databasePath, 9999);
    expect(found).toBeNull();
  });

  it("upserts on same testMappingId", async () => {
    const workspace = await setupWorkspace();
    const { testMappingId } = seedPrerequisites(workspace.databasePath);

    const first = saveRiskAssessment(
      workspace.databasePath,
      createSampleRiskAssessment(testMappingId),
    );

    const updated: RiskAssessmentResult = {
      ...createSampleRiskAssessment(testMappingId),
      frameworkSelections: [
        {
          framework: "error-guessing",
          reason: "Updated reason",
          relevantFiles: ["src/middleware/auth.ts"],
          priority: "high",
        },
        {
          framework: "state-transition",
          reason: "Auth lifecycle states",
          relevantFiles: ["src/middleware/auth.ts"],
          priority: "medium",
        },
      ],
    };
    const second = saveRiskAssessment(workspace.databasePath, updated);

    expect(first.id).toBe(second.id);
    expect(second.frameworkSelections).toHaveLength(2);
  });

  it("round-trips JSON columns through Zod validation", async () => {
    const workspace = await setupWorkspace();
    const { testMappingId } = seedPrerequisites(workspace.databasePath);

    saveRiskAssessment(
      workspace.databasePath,
      createSampleRiskAssessment(testMappingId),
    );
    const found = findRiskAssessment(workspace.databasePath, testMappingId);

    expect(found?.riskScores[0].factors[0].factor).toBe("uncovered-aspects");
    expect(found?.frameworkSelections[0].framework).toBe("error-guessing");
    expect(found?.explorationThemes[0].frameworks).toEqual(["error-guessing"]);
    expect(found?.explorationThemes[0].estimatedMinutes).toBe(20);
  });
});
