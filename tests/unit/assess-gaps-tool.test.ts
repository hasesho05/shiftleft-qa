import { afterEach, describe, expect, it } from "vitest";

import {
  findRiskAssessment,
  saveIntentContext,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { runAssessGapsFromMapping } from "../../src/exploratory-testing/tools/assess-gaps";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
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

describe("runAssessGapsFromMapping", () => {
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

  it("scores risk, selects frameworks, generates themes, and persists", async () => {
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

    const result = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    // Risk scores
    expect(result.persisted.riskScores.length).toBeGreaterThan(0);
    for (const score of result.persisted.riskScores) {
      expect(score.overallRisk).toBeGreaterThanOrEqual(0);
      expect(score.overallRisk).toBeLessThanOrEqual(1);
      expect(score.factors.length).toBeGreaterThan(0);
    }

    // Framework selections
    expect(result.persisted.frameworkSelections.length).toBeGreaterThan(0);
    for (const selection of result.persisted.frameworkSelections) {
      expect(selection.reason.length).toBeGreaterThan(0);
      expect(selection.relevantFiles.length).toBeGreaterThan(0);
    }

    // Exploration themes
    expect(result.persisted.explorationThemes.length).toBeGreaterThan(0);
    for (const theme of result.persisted.explorationThemes) {
      expect(theme.frameworks.length).toBeGreaterThan(0);
      expect(theme.estimatedMinutes).toBeGreaterThanOrEqual(1);
    }

    // DB persistence
    const dbRecord = findRiskAssessment(
      workspace.databasePath,
      mappingResult.persisted.id,
    );
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.riskScores.length).toBe(
      result.persisted.riskScores.length,
    );
  });

  it("writes a handover document for the assess-gaps step", async () => {
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

    const result = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    expect(result.handover.snapshot.stepName).toBe("assess-gaps");
    expect(result.handover.snapshot.status).toBe("completed");

    const handoverDoc = await readStepHandoverDocument(
      result.handover.filePath,
    );
    expect(handoverDoc.frontmatter.step_name).toBe("assess-gaps");
    expect(handoverDoc.body).toContain("Risk Scores");
    expect(handoverDoc.body).toContain("Framework Selections");
    expect(handoverDoc.body).toContain("Exploration Themes");
  });

  it("is idempotent for same mapping", async () => {
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

    const first = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );
    const second = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    expect(first.persisted.id).toBe(second.persisted.id);
  });

  it("orders themes by risk level (high first)", async () => {
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

    const result = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    const priorities = result.persisted.explorationThemes.map(
      (t) => t.riskLevel,
    );
    const order = { high: 3, medium: 2, low: 1 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]]).toBeLessThanOrEqual(
        order[priorities[i - 1]],
      );
    }
  });

  it("enriches exploration theme descriptions with intent context when available", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    const intentContext: IntentContext = {
      changePurpose: "bugfix",
      userStory: "As a user, I see correct validation errors",
      acceptanceCriteria: ["Error messages shown for invalid input"],
      nonGoals: [],
      targetUsers: [],
      notesForQa: [],
      sourceRefs: [],
      extractionStatus: "parsed",
    };
    saveIntentContext(workspace.databasePath, prIntake.id, intentContext);

    const contextResult = await runDiscoverContextFromIntake(prIntake, config);
    const mappingResult = await runMapTestsFromAnalysis(
      contextResult.persisted,
      prIntake,
      config,
    );

    const result = await runAssessGapsFromMapping(
      mappingResult.persisted,
      contextResult.persisted,
      config,
    );

    // At least one theme should mention bugfix/regression context
    const descriptions = result.persisted.explorationThemes.map(
      (t) => t.description,
    );
    const hasIntentEnrichment = descriptions.some(
      (d) =>
        d.includes("bugfix") ||
        d.includes("regression") ||
        d.includes("validation errors"),
    );
    expect(hasIntentEnrichment).toBe(true);
  });
});
