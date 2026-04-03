import { afterEach, describe, expect, it } from "vitest";

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
import {
  buildAllocationItems,
  runAllocate,
  summarizeAllocation,
} from "../../src/exploratory-testing/tools/allocate";
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
    title: "Shift-left allocation sample",
    description: "Exercise multiple allocation destinations",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/allocation",
    headSha: "abc1234",
    linkedIssues: [],
    changedFiles: [
      {
        path: "src/middleware/auth.ts",
        status: "modified",
        additions: 20,
        deletions: 2,
        previousPath: null,
      },
      {
        path: "src/validators/userInput.ts",
        status: "modified",
        additions: 18,
        deletions: 1,
        previousPath: null,
      },
      {
        path: "src/clients/paymentGateway.ts",
        status: "modified",
        additions: 28,
        deletions: 4,
        previousPath: null,
      },
      {
        path: "src/pages/Checkout.tsx",
        status: "modified",
        additions: 32,
        deletions: 6,
        previousPath: null,
      },
      {
        path: "src/components/Button.tsx",
        status: "modified",
        additions: 26,
        deletions: 3,
        previousPath: null,
      },
      {
        path: "scripts/format.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        previousPath: null,
      },
      {
        path: "src/utility.ts",
        status: "modified",
        additions: 140,
        deletions: 12,
        previousPath: null,
      },
      {
        path: "src/features/flags.ts",
        status: "modified",
        additions: 12,
        deletions: 1,
        previousPath: null,
      },
    ],
    reviewComments: [
      {
        author: "bob",
        body: "Please verify auth guard behavior.",
        path: "src/middleware/auth.ts",
        createdAt: "2026-04-01T00:00:00Z",
      },
    ],
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
        additions: 20,
        deletions: 2,
        categories: [
          { category: "permission", confidence: 0.9, reason: "Auth guard" },
        ],
      },
      {
        path: "src/validators/userInput.ts",
        status: "modified",
        additions: 18,
        deletions: 1,
        categories: [
          { category: "validation", confidence: 0.9, reason: "Validator" },
        ],
      },
      {
        path: "src/clients/paymentGateway.ts",
        status: "modified",
        additions: 28,
        deletions: 4,
        categories: [
          { category: "api", confidence: 0.85, reason: "Client boundary" },
          { category: "async", confidence: 0.8, reason: "Retry handling" },
          {
            category: "cross-service",
            confidence: 0.8,
            reason: "External gateway",
          },
        ],
      },
      {
        path: "src/pages/Checkout.tsx",
        status: "modified",
        additions: 32,
        deletions: 6,
        categories: [
          { category: "ui", confidence: 0.8, reason: "Page component" },
        ],
      },
      {
        path: "src/components/Button.tsx",
        status: "modified",
        additions: 26,
        deletions: 3,
        categories: [
          { category: "ui", confidence: 0.8, reason: "Component" },
          {
            category: "shared-component",
            confidence: 0.8,
            reason: "Shared UI",
          },
        ],
      },
      {
        path: "scripts/format.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        categories: [],
      },
      {
        path: "src/utility.ts",
        status: "modified",
        additions: 140,
        deletions: 12,
        categories: [],
      },
      {
        path: "src/features/flags.ts",
        status: "modified",
        additions: 12,
        deletions: 1,
        categories: [
          { category: "feature-flag", confidence: 0.9, reason: "Flag config" },
        ],
      },
    ],
    relatedCodes: [],
    viewpointSeeds: [
      { viewpoint: "functional-user-flow", seeds: ["checkout", "login"] },
    ],
    summary: "Multiple files analyzed",
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
    testAssets: [
      {
        path: "tests/unit/flags.test.ts",
        layer: "unit",
        relatedTo: ["src/features/flags.ts"],
        confidence: 0.9,
      },
      {
        path: "tests/unit/format.test.ts",
        layer: "unit",
        relatedTo: ["scripts/format.ts"],
        confidence: 0.9,
      },
    ],
    testSummaries: [
      {
        testAssetPath: "tests/unit/flags.test.ts",
        layer: "unit",
        coveredAspects: [
          "happy-path",
          "error-path",
          "permission",
          "state-transition",
        ],
        coverageConfidence: "confirmed",
        description: "Feature flag behavior is covered",
      },
      {
        testAssetPath: "tests/unit/format.test.ts",
        layer: "unit",
        coveredAspects: [
          "error-path",
          "boundary",
          "permission",
          "state-transition",
          "mock-fixture",
        ],
        coverageConfidence: "confirmed",
        description: "Formatting edge cases are covered",
      },
    ],
    coverageGapMap: [
      {
        changedFilePath: "src/middleware/auth.ts",
        aspect: "permission",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
      },
      {
        changedFilePath: "src/validators/userInput.ts",
        aspect: "boundary",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
      },
      {
        changedFilePath: "src/clients/paymentGateway.ts",
        aspect: "boundary",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
      },
      {
        changedFilePath: "src/clients/paymentGateway.ts",
        aspect: "state-transition",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
      },
      {
        changedFilePath: "src/pages/Checkout.tsx",
        aspect: "happy-path",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
      },
      {
        changedFilePath: "src/components/Button.tsx",
        aspect: "happy-path",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "medium",
      },
      {
        changedFilePath: "scripts/format.ts",
        aspect: "happy-path",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "low",
      },
      {
        changedFilePath: "scripts/format.ts",
        aspect: "error-path",
        status: "covered",
        coveredBy: ["tests/unit/format.test.ts"],
        explorationPriority: "low",
      },
      {
        changedFilePath: "scripts/format.ts",
        aspect: "boundary",
        status: "covered",
        coveredBy: ["tests/unit/format.test.ts"],
        explorationPriority: "low",
      },
      {
        changedFilePath: "scripts/format.ts",
        aspect: "permission",
        status: "covered",
        coveredBy: ["tests/unit/format.test.ts"],
        explorationPriority: "low",
      },
      {
        changedFilePath: "scripts/format.ts",
        aspect: "state-transition",
        status: "covered",
        coveredBy: ["tests/unit/format.test.ts"],
        explorationPriority: "low",
      },
      {
        changedFilePath: "scripts/format.ts",
        aspect: "mock-fixture",
        status: "covered",
        coveredBy: ["tests/unit/format.test.ts"],
        explorationPriority: "low",
      },
      {
        changedFilePath: "src/utility.ts",
        aspect: "happy-path",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
      },
      {
        changedFilePath: "src/features/flags.ts",
        aspect: "permission",
        status: "covered",
        coveredBy: ["tests/unit/flags.test.ts"],
        explorationPriority: "low",
      },
      {
        changedFilePath: "src/features/flags.ts",
        aspect: "state-transition",
        status: "covered",
        coveredBy: ["tests/unit/flags.test.ts"],
        explorationPriority: "low",
      },
    ],
    missingLayers: ["e2e", "visual"],
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
        overallRisk: 0.82,
        factors: [{ factor: "permission", weight: 0.5, contribution: 0.41 }],
      },
      {
        changedFilePath: "src/validators/userInput.ts",
        overallRisk: 0.76,
        factors: [{ factor: "validation", weight: 0.5, contribution: 0.38 }],
      },
      {
        changedFilePath: "src/clients/paymentGateway.ts",
        overallRisk: 0.88,
        factors: [{ factor: "cross-service", weight: 0.5, contribution: 0.44 }],
      },
      {
        changedFilePath: "src/pages/Checkout.tsx",
        overallRisk: 0.71,
        factors: [{ factor: "ui", weight: 0.5, contribution: 0.36 }],
      },
      {
        changedFilePath: "src/components/Button.tsx",
        overallRisk: 0.65,
        factors: [
          { factor: "shared-component", weight: 0.5, contribution: 0.33 },
        ],
      },
      {
        changedFilePath: "scripts/format.ts",
        overallRisk: 0.22,
        factors: [{ factor: "small-change", weight: 0.5, contribution: 0.08 }],
      },
      {
        changedFilePath: "src/utility.ts",
        overallRisk: 0.93,
        factors: [
          { factor: "uncovered-aspects", weight: 0.5, contribution: 0.46 },
        ],
      },
      {
        changedFilePath: "src/features/flags.ts",
        overallRisk: 0.3,
        factors: [{ factor: "feature-flag", weight: 0.5, contribution: 0.15 }],
      },
    ],
    frameworkSelections: [],
    explorationThemes: [],
    assessedAt: "2026-04-01T00:00:00Z",
  };
}

describe("allocate tool", () => {
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

  function seedAllocationPipeline(databasePath: string): number {
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

  it("builds allocation items that cover the main destinations", async () => {
    const workspace = await setupWorkspace();
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSamplePrMetadata(),
    );
    const changeAnalysis = saveChangeAnalysis(
      workspace.databasePath,
      createSampleChangeAnalysis(prIntake.id),
    );
    const testMapping = saveTestMapping(
      workspace.databasePath,
      createSampleTestMapping(prIntake.id, changeAnalysis.id),
    );
    const riskAssessment = saveRiskAssessment(
      workspace.databasePath,
      createSampleRiskAssessment(testMapping.id),
    );
    const context = {
      riskAssessment,
      testMapping,
      changeAnalysis,
      prIntake,
    };

    const items = buildAllocationItems(context);
    expect(items.some((item) => item.recommendedDestination === "review")).toBe(
      true,
    );
    expect(items.some((item) => item.recommendedDestination === "unit")).toBe(
      true,
    );
    expect(
      items.some((item) => item.recommendedDestination === "integration"),
    ).toBe(true);
    expect(items.some((item) => item.recommendedDestination === "e2e")).toBe(
      true,
    );
    expect(items.some((item) => item.recommendedDestination === "visual")).toBe(
      true,
    );
    expect(
      items.some((item) => item.recommendedDestination === "dev-box"),
    ).toBe(true);
    expect(
      items.some(
        (item) => item.recommendedDestination === "manual-exploration",
      ),
    ).toBe(true);
    expect(items.some((item) => item.recommendedDestination === "skip")).toBe(
      true,
    );
  });

  it("runs allocation end to end and persists the generated items", async () => {
    const workspace = await setupWorkspace();
    const riskAssessmentId = seedAllocationPipeline(workspace.databasePath);

    const result = await runAllocate({
      riskAssessmentId,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect(result.items.length).toBeGreaterThanOrEqual(8);
    expect(result.destinationCounts.review).toBeGreaterThan(0);
    expect(result.destinationCounts.unit).toBeGreaterThan(0);
    expect(result.destinationCounts.integration).toBeGreaterThan(0);
    expect(result.destinationCounts.e2e).toBeGreaterThan(0);
    expect(result.destinationCounts.visual).toBeGreaterThan(0);
    expect(result.destinationCounts["dev-box"]).toBeGreaterThan(0);
    expect(result.destinationCounts["manual-exploration"]).toBeGreaterThan(0);
    expect(result.destinationCounts.skip).toBeGreaterThan(0);
  });

  it("summarizes allocation with representative items", async () => {
    const workspace = await setupWorkspace();
    const riskAssessmentId = seedAllocationPipeline(workspace.databasePath);

    await runAllocate({
      riskAssessmentId,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    const summary = await summarizeAllocation({
      riskAssessmentId,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect(summary.totalItems).toBeGreaterThan(0);
    expect(summary.representativeItems.length).toBeGreaterThan(0);
    expect(summary.destinationCounts.review).toBeGreaterThan(0);
  });
});
