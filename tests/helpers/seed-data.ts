import {
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

export function seedSessionCharters(databasePath: string): {
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
    ],
    generatedAt: "2026-04-01T00:00:00Z",
  } satisfies SessionCharterGenerationResult);

  return { sessionChartersId: sessionCharters.id };
}

export function seedSessionWithObservation(databasePath: string): {
  sessionId: number;
  observationId: number;
} {
  const { sessionChartersId } = seedSessionCharters(databasePath);

  const session = saveSession(databasePath, {
    sessionChartersId,
    charterIndex: 0,
    charterTitle: "Auth error handling",
  });
  updateSessionStatus(databasePath, {
    sessionId: session.id,
    status: "in_progress",
    startedAt: "2026-04-01T10:00:00Z",
  });

  const observation = saveObservation(databasePath, {
    sessionId: session.id,
    targetedHeuristic: "error-guessing",
    action: "Submit invalid credentials",
    expected: "Error message",
    actual: "Application crashed",
    outcome: "fail",
    note: "Unhandled rejection",
    evidencePath: null,
  });

  return { sessionId: session.id, observationId: observation.id };
}
