import { afterEach, describe, expect, it } from "vitest";

import {
  findLatestRiskAssessmentByPr,
  resolvePrIdentity,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { AnalyzePrResult } from "../../src/exploratory-testing/tools/analyze-pr";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  createSamplePrMetadata,
  populateFullAnalysisChain,
} from "../helpers/orchestration-fixtures";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("PR-based record resolution", () => {
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

  it("resolvePrIdentity finds unique provider/repository from PR number", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    const identity = resolvePrIdentity(workspace.databasePath, 42);
    expect(identity).not.toBeNull();
    expect(identity?.provider).toBe("github");
    expect(identity?.repository).toBe("owner/repo");
  });

  it("resolvePrIdentity returns null for non-existent PR", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    const identity = resolvePrIdentity(workspace.databasePath, 999);
    expect(identity).toBeNull();
  });

  it("resolvePrIdentity throws when same PR number exists under multiple repos", async () => {
    const workspace = await setupWorkspace();
    populateFullAnalysisChain(workspace.databasePath);

    // Add a second intake with same PR number but different repository
    const metadata2 = {
      ...createSamplePrMetadata(),
      repository: "other-owner/other-repo",
      headSha: "def5678",
    };
    savePrIntake(workspace.databasePath, metadata2);

    expect(() => resolvePrIdentity(workspace.databasePath, 42)).toThrow(
      /multiple repositories/,
    );
  });

  it("findLatestRiskAssessmentByPr resolves full chain with provider/repository", async () => {
    const workspace = await setupWorkspace();
    const chain = populateFullAnalysisChain(workspace.databasePath);

    const assessment = findLatestRiskAssessmentByPr(
      workspace.databasePath,
      "github",
      "owner/repo",
      42,
    );
    expect(assessment).not.toBeNull();
    expect(assessment?.id).toBe(chain.riskAssessmentId);
  });

  it("findLatestRiskAssessmentByPr returns null when no chain exists", async () => {
    const workspace = await setupWorkspace();

    const assessment = findLatestRiskAssessmentByPr(
      workspace.databasePath,
      "github",
      "owner/repo",
      42,
    );
    expect(assessment).toBeNull();
  });
});

describe("AnalyzePrResult contract", () => {
  it("result type exposes only user-facing fields without internal IDs", () => {
    const sample: AnalyzePrResult = {
      prNumber: 1,
      provider: "github",
      repository: "owner/repo",
      title: "Test",
      author: "alice",
      headSha: "abc123",
      intentContext: null,
      changedFiles: { total: 0, categories: {} },
      testCoverage: { assets: 0, gapEntries: 0, missingLayers: [] },
      riskHighlights: { highRiskFiles: 0, frameworks: [], themes: 0 },
      layerApplicability: {
        unit: { layer: "unit", status: "not-primary", reason: "test" },
        "integration-service": {
          layer: "integration-service",
          status: "not-primary",
          reason: "test",
        },
        "ui-e2e": { layer: "ui-e2e", status: "not-primary", reason: "test" },
        visual: { layer: "visual", status: "not-primary", reason: "test" },
        "manual-exploration": {
          layer: "manual-exploration",
          status: "not-primary",
          reason: "test",
        },
      },
      summary: "test",
    };

    expect(sample.prNumber).toBe(1);
    expect("prIntakeId" in sample).toBe(false);
    expect("riskAssessmentId" in sample).toBe(false);
    expect("changeAnalysisId" in sample).toBe(false);
    expect("testMappingId" in sample).toBe(false);
  });
});
