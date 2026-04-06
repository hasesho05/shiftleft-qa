import {
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

export function createSamplePrMetadata(): PrMetadata {
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

export function seedAnalysisChain(databasePath: string): {
  riskAssessmentId: number;
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

  return {
    riskAssessmentId: riskAssessment.id,
  };
}

export function createSampleAllocationItems(
  riskAssessmentId: number,
): readonly AllocationItem[] {
  return [
    {
      riskAssessmentId,
      title: "Auth middleware error paths",
      changedFilePaths: ["src/middleware/auth.ts"],
      riskLevel: "high",
      recommendedDestination: "manual-exploration",
      confidence: 0.85,
      rationale: "Complex error handling requires manual exploration",
      sourceSignals: {
        categories: ["permission"],
        existingTestLayers: [],
        gapAspects: ["error-path", "permission"],
        reviewComments: [],
        riskSignals: ["no existing tests"],
      },
    },
    {
      riskAssessmentId,
      title: "Auth input validation",
      changedFilePaths: ["src/middleware/auth.ts"],
      riskLevel: "medium",
      recommendedDestination: "unit",
      confidence: 0.7,
      rationale: "Boundary checks are unit-testable",
      sourceSignals: {
        categories: ["permission"],
        existingTestLayers: [],
        gapAspects: ["boundary"],
        reviewComments: [],
        riskSignals: [],
      },
    },
    {
      riskAssessmentId,
      title: "Auth code review items",
      changedFilePaths: ["src/middleware/auth.ts"],
      riskLevel: "low",
      recommendedDestination: "review",
      confidence: 0.4,
      rationale: "Naming conventions need review",
      sourceSignals: {
        categories: ["permission"],
        existingTestLayers: [],
        gapAspects: ["happy-path"],
        reviewComments: ["naming"],
        riskSignals: [],
      },
    },
  ];
}

export function seedAnalysisChainWithAllocations(databasePath: string): {
  riskAssessmentId: number;
} {
  const result = seedAnalysisChain(databasePath);
  const items = createSampleAllocationItems(result.riskAssessmentId);
  saveAllocationItems(databasePath, result.riskAssessmentId, items);
  return result;
}
