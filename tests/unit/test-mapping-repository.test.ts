import { afterEach, describe, expect, it } from "vitest";

import {
  findTestMapping,
  saveChangeAnalysis,
  savePrIntake,
  saveTestMapping,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { ChangeAnalysisResult } from "../../src/exploratory-testing/models/change-analysis";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
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
          {
            category: "permission",
            confidence: 0.9,
            reason: "auth middleware",
          },
        ],
      },
    ],
    relatedCodes: [],
    viewpointSeeds: [],
    summary: "1 file analyzed: permission",
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
        path: "tests/unit/auth.test.ts",
        layer: "unit",
        relatedTo: ["src/middleware/auth.ts"],
        confidence: 0.9,
      },
    ],
    testSummaries: [
      {
        testAssetPath: "tests/unit/auth.test.ts",
        layer: "unit",
        coveredAspects: ["happy-path", "error-path"],
        coverageConfidence: "confirmed",
        description: "Tests login and logout flows",
      },
    ],
    coverageGapMap: [
      {
        changedFilePath: "src/middleware/auth.ts",
        aspect: "happy-path",
        status: "covered",
        coveredBy: ["tests/unit/auth.test.ts"],
        explorationPriority: "low",
      },
      {
        changedFilePath: "src/middleware/auth.ts",
        aspect: "permission",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
      },
    ],
    missingLayers: ["e2e", "visual"],
    mappedAt: "2026-04-01T00:00:00Z",
  };
}

describe("test mapping repository", () => {
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

  function seedPrAndAnalysis(databasePath: string): {
    prIntakeId: number;
    changeAnalysisId: number;
  } {
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
    const analysis = saveChangeAnalysis(
      databasePath,
      createSampleChangeAnalysis(prIntake.id),
    );
    return { prIntakeId: prIntake.id, changeAnalysisId: analysis.id };
  }

  it("saves and retrieves a test mapping record", async () => {
    const workspace = await setupWorkspace();
    const { prIntakeId, changeAnalysisId } = seedPrAndAnalysis(
      workspace.databasePath,
    );
    const mapping = createSampleTestMapping(prIntakeId, changeAnalysisId);

    const persisted = saveTestMapping(workspace.databasePath, mapping);

    expect(persisted.prIntakeId).toBe(prIntakeId);
    expect(persisted.changeAnalysisId).toBe(changeAnalysisId);
    expect(persisted.testAssets).toHaveLength(1);
    expect(persisted.testSummaries).toHaveLength(1);
    expect(persisted.coverageGapMap).toHaveLength(2);
    expect(persisted.missingLayers).toEqual(["e2e", "visual"]);

    const found = findTestMapping(workspace.databasePath, changeAnalysisId);
    expect(found).not.toBeNull();
    expect(found?.testAssets).toHaveLength(1);
  });

  it("returns null when no test mapping found", async () => {
    const workspace = await setupWorkspace();

    const found = findTestMapping(workspace.databasePath, 9999);
    expect(found).toBeNull();
  });

  it("upserts on same changeAnalysisId", async () => {
    const workspace = await setupWorkspace();
    const { prIntakeId, changeAnalysisId } = seedPrAndAnalysis(
      workspace.databasePath,
    );

    const mapping1 = createSampleTestMapping(prIntakeId, changeAnalysisId);
    const first = saveTestMapping(workspace.databasePath, mapping1);

    const mapping2: TestMappingResult = {
      ...mapping1,
      testAssets: [
        ...mapping1.testAssets,
        {
          path: "tests/e2e/auth.spec.ts",
          layer: "e2e",
          relatedTo: ["src/middleware/auth.ts"],
          confidence: 0.7,
        },
      ],
      missingLayers: ["visual"],
    };
    const second = saveTestMapping(workspace.databasePath, mapping2);

    expect(first.id).toBe(second.id);
    expect(second.testAssets).toHaveLength(2);
    expect(second.missingLayers).toEqual(["visual"]);
  });

  it("round-trips JSON columns through Valibot validation", async () => {
    const workspace = await setupWorkspace();
    const { prIntakeId, changeAnalysisId } = seedPrAndAnalysis(
      workspace.databasePath,
    );
    const mapping = createSampleTestMapping(prIntakeId, changeAnalysisId);

    saveTestMapping(workspace.databasePath, mapping);
    const found = findTestMapping(workspace.databasePath, changeAnalysisId);

    expect(found?.testAssets[0].layer).toBe("unit");
    expect(found?.testAssets[0].confidence).toBe(0.9);
    expect(found?.testSummaries[0].coveredAspects).toEqual([
      "happy-path",
      "error-path",
    ]);
    expect(found?.testSummaries[0].coverageConfidence).toBe("confirmed");
    expect(found?.coverageGapMap[0].status).toBe("covered");
    expect(found?.coverageGapMap[1].explorationPriority).toBe("high");
  });
});
