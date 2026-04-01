import { afterEach, describe, expect, it } from "vitest";

import {
  findSessionCharters,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { runAssessGapsFromMapping } from "../../src/exploratory-testing/tools/assess-gaps";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
import { runGenerateChartersFromAssessment } from "../../src/exploratory-testing/tools/generate-charters";
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

describe("runGenerateChartersFromAssessment", () => {
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

  it("generates charters, persists them, and writes a handover document", async () => {
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

    const result = await runGenerateChartersFromAssessment(
      assessResult.persisted,
      mappingResult.persisted.coverageGapMap,
      config,
    );

    // Charters generated
    expect(result.persisted.charters.length).toBeGreaterThan(0);

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

    const result = await runGenerateChartersFromAssessment(
      assessResult.persisted,
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

    const first = await runGenerateChartersFromAssessment(
      assessResult.persisted,
      mappingResult.persisted.coverageGapMap,
      config,
    );
    const second = await runGenerateChartersFromAssessment(
      assessResult.persisted,
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

    const result = await runGenerateChartersFromAssessment(
      assessResult.persisted,
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
});
