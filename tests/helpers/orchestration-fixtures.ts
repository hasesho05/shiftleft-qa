import {
  saveChangeAnalysis,
  savePrIntake,
  saveRiskAssessment,
  saveTestMapping,
} from "../../src/exploratory-testing/db/workspace-repository";
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

/**
 * Pre-populate the full chain: prIntake → changeAnalysis → testMapping → riskAssessment.
 * Returns the riskAssessment ID so tests can verify lookup functions.
 */
export function populateFullAnalysisChain(databasePath: string): {
  readonly prIntakeId: number;
  readonly changeAnalysisId: number;
  readonly testMappingId: number;
  readonly riskAssessmentId: number;
} {
  const metadata = createSamplePrMetadata();
  const prIntake = savePrIntake(databasePath, metadata);

  const changeAnalysisResult: ChangeAnalysisResult = {
    prIntakeId: prIntake.id,
    fileAnalyses: [
      {
        path: "src/middleware/auth.ts",
        status: "modified",
        additions: 30,
        deletions: 5,
        categories: [
          {
            category: "permission",
            confidence: 0.9,
            reason: "auth middleware",
          },
        ],
      },
      {
        path: "src/components/LoginForm.tsx",
        status: "added",
        additions: 80,
        deletions: 0,
        categories: [
          { category: "ui", confidence: 0.9, reason: "React component" },
        ],
      },
    ],
    relatedCodes: [],
    viewpointSeeds: [
      { viewpoint: "functional-user-flow", seeds: ["auth flow"] },
      { viewpoint: "user-persona", seeds: [] },
      { viewpoint: "ui-look-and-feel", seeds: [] },
      { viewpoint: "data-and-error-handling", seeds: [] },
      { viewpoint: "architecture-cross-cutting", seeds: [] },
    ],
    summary: "2 files, permission + UI",
    analyzedAt: new Date().toISOString(),
  };
  const changeAnalysis = saveChangeAnalysis(databasePath, changeAnalysisResult);

  const testMappingResult: TestMappingResult = {
    prIntakeId: prIntake.id,
    changeAnalysisId: changeAnalysis.id,
    testAssets: [],
    testSummaries: [],
    coverageGapMap: [
      {
        changedFilePath: "src/middleware/auth.ts",
        aspect: "happy-path",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
        stabilityNotes: [],
      },
    ],
    missingLayers: ["unit"],
    mappedAt: new Date().toISOString(),
  };
  const testMapping = saveTestMapping(databasePath, testMappingResult);

  const riskAssessmentResult: RiskAssessmentResult = {
    testMappingId: testMapping.id,
    riskScores: [
      {
        changedFilePath: "src/middleware/auth.ts",
        overallRisk: 0.8,
        factors: [
          {
            factor: "complexity",
            weight: 0.5,
            contribution: 0.45,
          },
        ],
      },
    ],
    frameworkSelections: [
      {
        framework: "error-guessing",
        reason: "permission related changes",
        relevantFiles: ["src/middleware/auth.ts"],
        priority: "high",
      },
    ],
    explorationThemes: [
      {
        title: "Auth middleware edge cases",
        description: "High risk permission changes need exploration",
        frameworks: ["error-guessing"],
        targetFiles: ["src/middleware/auth.ts"],
        riskLevel: "high",
        estimatedMinutes: 15,
      },
    ],
    assessedAt: new Date().toISOString(),
  };
  const riskAssessment = saveRiskAssessment(databasePath, riskAssessmentResult);

  return {
    prIntakeId: prIntake.id,
    changeAnalysisId: changeAnalysis.id,
    testMappingId: testMapping.id,
    riskAssessmentId: riskAssessment.id,
  };
}
