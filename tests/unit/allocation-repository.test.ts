import { afterEach, describe, expect, it } from "vitest";

import {
  countAllocationItemsByDestination,
  listAllocationItems,
  listAllocationItemsByDestination,
  saveAllocationItems,
  saveChangeAnalysis,
  savePrIntake,
  saveRiskAssessment,
  saveTestMapping,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { AllocationItem } from "../../src/exploratory-testing/models/allocation";
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
    title: "Add feature X",
    description: "Implements feature X",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/x",
    headSha: "abc1234",
    linkedIssues: [],
    changedFiles: [
      {
        path: "src/index.ts",
        status: "modified",
        additions: 12,
        deletions: 2,
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
        path: "src/index.ts",
        status: "modified",
        additions: 12,
        deletions: 2,
        categories: [
          { category: "validation", confidence: 0.9, reason: "Input parsing" },
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
        changedFilePath: "src/index.ts",
        overallRisk: 0.78,
        factors: [
          { factor: "uncovered-aspects", weight: 0.4, contribution: 0.24 },
          { factor: "change-magnitude", weight: 0.3, contribution: 0.15 },
          { factor: "category-risk", weight: 0.3, contribution: 0.39 },
        ],
      },
    ],
    frameworkSelections: [],
    explorationThemes: [],
    assessedAt: "2026-04-01T00:00:00Z",
  };
}

function createAllocationItems(riskAssessmentId: number): AllocationItem[] {
  return [
    {
      riskAssessmentId,
      title: "Review src/index.ts (permission)",
      changedFilePaths: ["src/index.ts"],
      riskLevel: "high",
      recommendedDestination: "review",
      confidence: 0.9,
      rationale: "Permission changes should be reviewed before QA handoff.",
      sourceSignals: {
        categories: ["permission"],
        existingTestLayers: [],
        gapAspects: ["permission"],
        reviewComments: ["Needs auth review"],
        riskSignals: ["permission"],
      },
    },
    {
      riskAssessmentId,
      title: "Unit coverage for src/index.ts (boundary)",
      changedFilePaths: ["src/index.ts"],
      riskLevel: "medium",
      recommendedDestination: "unit",
      confidence: 0.85,
      rationale: "Boundary checks are deterministic and should be unit tested.",
      sourceSignals: {
        categories: ["validation"],
        existingTestLayers: ["unit"],
        gapAspects: ["boundary"],
        reviewComments: [],
        riskSignals: ["validation"],
      },
    },
    {
      riskAssessmentId,
      title: "Manual exploration for src/index.ts (error-path)",
      changedFilePaths: ["src/index.ts"],
      riskLevel: "high",
      recommendedDestination: "manual-exploration",
      confidence: 0.4,
      rationale: "This still needs hands-on validation.",
      sourceSignals: {
        categories: [],
        existingTestLayers: [],
        gapAspects: ["error-path"],
        reviewComments: [],
        riskSignals: ["timing"],
      },
    },
  ];
}

describe("allocation repository", () => {
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

  function seedDependencies(databasePath: string): number {
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

    return riskAssessment.id;
  }

  it("saves, lists, and counts allocation items", async () => {
    const workspace = await setupWorkspace();
    const riskAssessmentId = seedDependencies(workspace.databasePath);

    const saved = saveAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
      createAllocationItems(riskAssessmentId),
    );

    expect(saved).toHaveLength(3);
    expect(saved[0]?.recommendedDestination).toBe("review");

    const listed = listAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
    );
    expect(listed).toHaveLength(3);
    expect(
      listAllocationItemsByDestination(
        workspace.databasePath,
        riskAssessmentId,
        "unit",
      ),
    ).toHaveLength(1);

    expect(
      countAllocationItemsByDestination(
        workspace.databasePath,
        riskAssessmentId,
      ),
    ).toEqual({
      review: 1,
      unit: 1,
      integration: 0,
      e2e: 0,
      visual: 0,
      "dev-box": 0,
      "manual-exploration": 1,
      skip: 0,
    });
  });

  it("replaces prior allocation items for the same risk assessment", async () => {
    const workspace = await setupWorkspace();
    const riskAssessmentId = seedDependencies(workspace.databasePath);

    saveAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
      createAllocationItems(riskAssessmentId),
    );

    const updated = saveAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
      [
        {
          riskAssessmentId,
          title: "Review src/index.ts (permission)",
          changedFilePaths: ["src/index.ts"],
          riskLevel: "high",
          recommendedDestination: "review",
          confidence: 0.95,
          rationale: "Updated review note",
          sourceSignals: {
            categories: ["permission"],
            existingTestLayers: [],
            gapAspects: ["permission"],
            reviewComments: [],
            riskSignals: ["permission"],
          },
        },
      ],
    );

    expect(updated).toHaveLength(1);
    expect(
      listAllocationItems(workspace.databasePath, riskAssessmentId),
    ).toHaveLength(1);
  });

  it("round-trips optional explanation fields in sourceSignals", async () => {
    const workspace = await setupWorkspace();
    const riskAssessmentId = seedDependencies(workspace.databasePath);

    const itemsWithExplanation: AllocationItem[] = [
      {
        riskAssessmentId,
        title: "Review src/index.ts (permission)",
        changedFilePaths: ["src/index.ts"],
        riskLevel: "high",
        recommendedDestination: "review",
        confidence: 0.9,
        rationale: "Permission changes should be reviewed.",
        sourceSignals: {
          categories: ["permission"],
          existingTestLayers: [],
          gapAspects: ["permission"],
          reviewComments: [],
          riskSignals: ["permission"],
          reasoningSummary:
            "Permission category triggers review; auth guard needs human verification.",
          alternativeDestinations: ["unit", "manual-exploration"],
          openQuestions: ["Does the guard cover admin endpoints?"],
        },
      },
      {
        riskAssessmentId,
        title: "Manual exploration for src/index.ts (error-path)",
        changedFilePaths: ["src/index.ts"],
        riskLevel: "high",
        recommendedDestination: "manual-exploration",
        confidence: 0.4,
        rationale: "Stateful risk remains.",
        sourceSignals: {
          categories: [],
          existingTestLayers: [],
          gapAspects: ["error-path"],
          reviewComments: [],
          riskSignals: ["timing"],
          reasoningSummary:
            "No deterministic category matched; stateful error paths remain ambiguous.",
          alternativeDestinations: ["dev-box"],
          openQuestions: [],
          manualRemainder:
            "Error recovery involves timing-dependent state that cannot be pinned by automated tests.",
        },
      },
    ];

    const saved = saveAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
      itemsWithExplanation,
    );

    expect(saved).toHaveLength(2);
    expect(saved[0]?.sourceSignals.reasoningSummary).toBe(
      "Permission category triggers review; auth guard needs human verification.",
    );
    expect(saved[0]?.sourceSignals.alternativeDestinations).toEqual([
      "unit",
      "manual-exploration",
    ]);
    expect(saved[0]?.sourceSignals.openQuestions).toEqual([
      "Does the guard cover admin endpoints?",
    ]);
    expect(saved[0]?.sourceSignals.manualRemainder).toBeUndefined();

    expect(saved[1]?.sourceSignals.manualRemainder).toBe(
      "Error recovery involves timing-dependent state that cannot be pinned by automated tests.",
    );

    const listed = listAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
    );
    expect(listed[0]?.sourceSignals.reasoningSummary).toBe(
      "Permission category triggers review; auth guard needs human verification.",
    );
    expect(listed[1]?.sourceSignals.manualRemainder).toBe(
      "Error recovery involves timing-dependent state that cannot be pinned by automated tests.",
    );
  });

  it("round-trips items without optional fields (backward compat)", async () => {
    const workspace = await setupWorkspace();
    const riskAssessmentId = seedDependencies(workspace.databasePath);

    const saved = saveAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
      createAllocationItems(riskAssessmentId),
    );

    expect(saved[0]?.sourceSignals.reasoningSummary).toBeUndefined();
    expect(saved[0]?.sourceSignals.alternativeDestinations).toBeUndefined();
    expect(saved[0]?.sourceSignals.openQuestions).toBeUndefined();
    expect(saved[0]?.sourceSignals.manualRemainder).toBeUndefined();
  });

  it("throws when the risk assessment parent is missing", async () => {
    const workspace = await setupWorkspace();

    expect(() => saveAllocationItems(workspace.databasePath, 999, [])).toThrow(
      /Risk assessment not found/,
    );
  });
});
