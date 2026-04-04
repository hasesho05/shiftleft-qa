import { afterEach, describe, expect, it } from "vitest";

import {
  findSessionCharters,
  listAllocationItemsByDestination,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { runAllocate } from "../../src/exploratory-testing/tools/allocate";
import { runAssessGapsFromMapping } from "../../src/exploratory-testing/tools/assess-gaps";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
import {
  filterThemesByAllocation,
  runGenerateCharters,
  runGenerateChartersFromAllocation,
} from "../../src/exploratory-testing/tools/generate-charters";
import { runMapTestsFromAnalysis } from "../../src/exploratory-testing/tools/map-tests";
import { readStepHandoverDocument } from "../../src/exploratory-testing/tools/progress";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

function createSampleMetadata(): PrMetadata {
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
      {
        path: "src/validators/amount.ts",
        status: "modified",
        additions: 20,
        deletions: 8,
        previousPath: null,
      },
    ],
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

describe("runGenerateChartersFromAllocation", () => {
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

  it("generates charters from manual-exploration allocation items", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    const assessResult = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    await runAllocate({
      riskAssessmentId: assessResult.persisted.id,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    const manualItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "manual-exploration",
    );

    const devBoxItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "dev-box",
    );

    const result = await runGenerateChartersFromAllocation(
      assessResult.persisted,
      manualItems,
      devBoxItems,
      mappingResult.persisted.coverageGapMap,
      config,
    );

    // Charters generated only from manual-exploration items
    if (manualItems.length > 0) {
      expect(result.persisted.charters.length).toBeGreaterThan(0);
    }

    for (const charter of result.persisted.charters) {
      expect(charter.title.length).toBeGreaterThan(0);
      expect(charter.goal.length).toBeGreaterThan(0);
      expect(charter.scope.length).toBeGreaterThan(0);
      expect(charter.selectedFrameworks.length).toBeGreaterThan(0);
      expect(charter.observationTargets.length).toBeGreaterThan(0);
      expect(charter.stopConditions.length).toBeGreaterThan(0);
      expect(charter.timeboxMinutes).toBeGreaterThanOrEqual(1);
    }

    // DB persistence
    const dbRecord = findSessionCharters(
      workspace.databasePath,
      assessResult.persisted.id,
    );
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.charters.length).toBe(result.persisted.charters.length);
  });

  it("writes a handover document for the generate-charters step", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    const assessResult = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    await runAllocate({
      riskAssessmentId: assessResult.persisted.id,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    const manualItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "manual-exploration",
    );

    const devBoxItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "dev-box",
    );

    const result = await runGenerateChartersFromAllocation(
      assessResult.persisted,
      manualItems,
      devBoxItems,
      mappingResult.persisted.coverageGapMap,
      config,
    );

    expect(result.handover.snapshot.stepName).toBe("generate-charters");
    expect(result.handover.snapshot.status).toBe("completed");

    const handoverDoc = await readStepHandoverDocument(
      result.handover.filePath,
    );
    expect(handoverDoc.frontmatter.step_name).toBe("generate-charters");
    expect(handoverDoc.body).toContain("Charter Summary");
    expect(handoverDoc.body).toContain("Charter Details");
    expect(handoverDoc.body).toContain("Next step");

    // Pruning result is included
    expect(result.pruning).toBeDefined();
    expect(result.pruning.budgetMinutes).toBe(120);
    expect(result.pruning.selectedItemIds.length).toBeGreaterThanOrEqual(0);
    // Summary includes budget info
    expect(result.handover.snapshot.summary).toContain("budget:");
  });

  it("is idempotent for same risk assessment", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    const assessResult = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    await runAllocate({
      riskAssessmentId: assessResult.persisted.id,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    const manualItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "manual-exploration",
    );

    const devBoxItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "dev-box",
    );

    const first = await runGenerateChartersFromAllocation(
      assessResult.persisted,
      manualItems,
      devBoxItems,
      mappingResult.persisted.coverageGapMap,
      config,
    );
    const second = await runGenerateChartersFromAllocation(
      assessResult.persisted,
      manualItems,
      devBoxItems,
      mappingResult.persisted.coverageGapMap,
      config,
    );

    expect(first.persisted.id).toBe(second.persisted.id);
  });

  it("includes observation targets for web components", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    const assessResult = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    await runAllocate({
      riskAssessmentId: assessResult.persisted.id,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    const manualItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "manual-exploration",
    );

    const devBoxItems = listAllocationItemsByDestination(
      workspace.databasePath,
      assessResult.persisted.id,
      "dev-box",
    );

    const result = await runGenerateChartersFromAllocation(
      assessResult.persisted,
      manualItems,
      devBoxItems,
      mappingResult.persisted.coverageGapMap,
      config,
    );

    // Find charters targeting web components
    const webCharters = result.persisted.charters.filter((c) =>
      c.scope.some((s) => /\.(tsx|jsx|vue|svelte)$/.test(s)),
    );

    if (webCharters.length > 0) {
      for (const charter of webCharters) {
        const categories = charter.observationTargets.map((t) => t.category);
        expect(categories).toContain("network");
        expect(categories).toContain("console");
      }
    }
  });

  it("produces no charters when no manual-exploration items exist", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    const assessResult = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    // Pass empty manual items
    const result = await runGenerateChartersFromAllocation(
      assessResult.persisted,
      [],
      [],
      mappingResult.persisted.coverageGapMap,
      config,
    );

    expect(result.persisted.charters.length).toBe(0);
  });

  it("rejects when allocation has not been run for the risk assessment", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );
    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );
    await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    await expect(
      runGenerateCharters({
        prNumber: prIntake.prNumber,
        provider: prIntake.provider,
        repository: prIntake.repository,
        configPath: workspace.configPath,
        manifestPath: workspace.manifestPath,
      }),
    ).rejects.toThrow(/Run allocate run first/);
  });
});

describe("filterThemesByAllocation", () => {
  it("keeps only themes with targetFiles overlapping manual-exploration items", () => {
    const themes = [
      {
        title: "Theme A",
        description: "desc A",
        frameworks: ["error-guessing" as const],
        targetFiles: ["src/a.ts"],
        riskLevel: "high" as const,
        estimatedMinutes: 15,
      },
      {
        title: "Theme B",
        description: "desc B",
        frameworks: ["boundary-value-analysis" as const],
        targetFiles: ["src/b.ts"],
        riskLevel: "medium" as const,
        estimatedMinutes: 10,
      },
    ];

    const manualItems = [
      {
        id: 1,
        riskAssessmentId: 1,
        title: "Manual exploration for src/a.ts",
        changedFilePaths: ["src/a.ts"],
        riskLevel: "high" as const,
        recommendedDestination: "manual-exploration" as const,
        confidence: 0.35,
        rationale: "test",
        sourceSignals: {
          categories: [],
          existingTestLayers: [],
          gapAspects: [],
          reviewComments: [],
          riskSignals: [],
        },
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z",
      },
    ];

    const filtered = filterThemesByAllocation(themes, manualItems);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Theme A");
  });

  it("returns empty when no manual items provided", () => {
    const themes = [
      {
        title: "Theme A",
        description: "desc A",
        frameworks: ["error-guessing" as const],
        targetFiles: ["src/a.ts"],
        riskLevel: "high" as const,
        estimatedMinutes: 15,
      },
    ];

    const filtered = filterThemesByAllocation(themes, []);
    expect(filtered).toHaveLength(0);
  });

  it("does not include dev-box-only files in charter scope", () => {
    const themes = [
      {
        title: "Theme A",
        description: "desc A",
        frameworks: ["error-guessing" as const],
        targetFiles: ["src/a.ts"],
        riskLevel: "high" as const,
        estimatedMinutes: 15,
      },
      {
        title: "Theme B",
        description: "desc B",
        frameworks: ["sampling" as const],
        targetFiles: ["src/devbox.ts"],
        riskLevel: "low" as const,
        estimatedMinutes: 10,
      },
    ];

    const manualItems = [
      {
        id: 1,
        riskAssessmentId: 1,
        title: "Manual exploration for src/a.ts",
        changedFilePaths: ["src/a.ts"],
        riskLevel: "high" as const,
        recommendedDestination: "manual-exploration" as const,
        confidence: 0.35,
        rationale: "test",
        sourceSignals: {
          categories: [],
          existingTestLayers: [],
          gapAspects: [],
          reviewComments: [],
          riskSignals: [],
        },
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z",
      },
    ];

    const filtered = filterThemesByAllocation(themes, manualItems);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe("Theme A");
  });
});
