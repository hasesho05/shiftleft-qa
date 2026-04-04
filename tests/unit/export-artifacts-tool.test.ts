import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  saveChangeAnalysis,
  saveFinding,
  saveIntentContext,
  saveObservation,
  savePrIntake,
  saveRiskAssessment,
  saveSession,
  saveSessionCharters,
  saveTestMapping,
  updateSessionStatus,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { ChangeAnalysisResult } from "../../src/exploratory-testing/models/change-analysis";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";
import type { RiskAssessmentResult } from "../../src/exploratory-testing/models/risk-assessment";
import type { SessionCharterGenerationResult } from "../../src/exploratory-testing/models/session-charter";
import type { TestMappingResult } from "../../src/exploratory-testing/models/test-mapping";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import {
  type ExportArtifactsResult,
  exportArtifacts,
} from "../../src/exploratory-testing/tools/export-artifacts";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  createSamplePrMetadata,
  seedSessionCharters,
} from "../helpers/seed-data";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("export-artifacts tool", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setupWorkspaceWithFullPipeline(): Promise<
    TestWorkspace & {
      databasePath: string;
      sessionChartersId: number;
      sessionId: number;
    }
  > {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    const databasePath = result.databasePath;

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

    updateSessionStatus(databasePath, {
      sessionId: session.id,
      status: "completed",
      completedAt: "2026-04-01T10:30:00Z",
    });

    saveFinding(databasePath, {
      sessionId: session.id,
      observationId: observation.id,
      type: "defect",
      title: "Crash on invalid credentials",
      description: "Unhandled rejection when submitting bad creds",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
    });

    saveFinding(databasePath, {
      sessionId: session.id,
      observationId: observation.id,
      type: "automation-candidate",
      title: "Auth boundary validation",
      description: "Min/max input boundaries",
      severity: "medium",
      recommendedTestLayer: "unit",
      automationRationale: "Deterministic boundary check",
    });

    return {
      ...workspace,
      databasePath,
      sessionChartersId,
      sessionId: session.id,
    };
  }

  it("exports all 5 artifact files", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    expect(result.artifacts.explorationBrief).toMatch(/exploration-brief\.md$/);
    expect(result.artifacts.coverageGapMap).toMatch(/coverage-gap-map\.md$/);
    expect(result.artifacts.sessionCharters).toMatch(/session-charters\.md$/);
    expect(result.artifacts.findingsReport).toMatch(/findings-report\.md$/);
    expect(result.artifacts.automationCandidateReport).toMatch(
      /automation-candidate-report\.md$/,
    );
  });

  it("writes valid markdown for exploration brief", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.explorationBrief, "utf8");
    expect(content).toContain("# Exploration Brief");
    expect(content).toContain("Add user auth");
    expect(content).toContain("src/middleware/auth.ts");
  });

  it("writes valid markdown for coverage gap map", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.coverageGapMap, "utf8");
    expect(content).toContain("# Coverage Gap Map");
  });

  it("writes valid markdown for session charters", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.sessionCharters, "utf8");
    expect(content).toContain("# Session Charters");
    expect(content).toContain("Auth error handling");
  });

  it("writes valid markdown for findings report", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(result.artifacts.findingsReport, "utf8");
    expect(content).toContain("# Findings Report");
    expect(content).toContain("Crash on invalid credentials");
    expect(content).toContain("defect");
  });

  it("writes valid markdown for automation candidate report", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    const content = await readFile(
      result.artifacts.automationCandidateReport,
      "utf8",
    );
    expect(content).toContain("# Automation Candidate Report");
    expect(content).toContain("Auth boundary validation");
    expect(content).toContain("unit");
  });

  it("writes a handover document", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({
      prIntakeId: 1,
      config,
    });

    expect(result.handover.filePath).toMatch(/11-export-artifacts\.md$/);
  });

  it("rejects when prIntakeId does not exist", async () => {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    await initializeWorkspace(workspace.configPath, workspace.manifestPath);
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await expect(
      exportArtifacts({
        prIntakeId: 999,
        config,
      }),
    ).rejects.toThrow(/PR intake not found/);
  });

  it("is idempotent on re-export", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result1 = await exportArtifacts({ prIntakeId: 1, config });
    const result2 = await exportArtifacts({ prIntakeId: 1, config });

    const content1 = await readFile(result1.artifacts.findingsReport, "utf8");
    const content2 = await readFile(result2.artifacts.findingsReport, "utf8");
    expect(content1).toBe(content2);
  });

  describe("prerequisite validation", () => {
    it("rejects when change analysis is missing", async () => {
      const workspace = await createTestWorkspace();
      workspaces.push(workspace.root);
      const result = await initializeWorkspace(
        workspace.configPath,
        workspace.manifestPath,
      );
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      savePrIntake(result.databasePath, createSamplePrMetadata());

      await expect(exportArtifacts({ prIntakeId: 1, config })).rejects.toThrow(
        /Change analysis not found.*discover-context/,
      );
    });

    it("rejects when test mapping is missing", async () => {
      const workspace = await createTestWorkspace();
      workspaces.push(workspace.root);
      const result = await initializeWorkspace(
        workspace.configPath,
        workspace.manifestPath,
      );
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const prIntake = savePrIntake(
        result.databasePath,
        createSamplePrMetadata(),
      );
      saveChangeAnalysis(result.databasePath, {
        prIntakeId: prIntake.id,
        fileAnalyses: [],
        relatedCodes: [],
        viewpointSeeds: [],
        summary: "test",
        analyzedAt: "2026-04-01T00:00:00Z",
      } satisfies ChangeAnalysisResult);

      await expect(exportArtifacts({ prIntakeId: 1, config })).rejects.toThrow(
        /Test mapping not found.*map-tests/,
      );
    });

    it("rejects when risk assessment is missing", async () => {
      const workspace = await createTestWorkspace();
      workspaces.push(workspace.root);
      const result = await initializeWorkspace(
        workspace.configPath,
        workspace.manifestPath,
      );
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const prIntake = savePrIntake(
        result.databasePath,
        createSamplePrMetadata(),
      );
      const ca = saveChangeAnalysis(result.databasePath, {
        prIntakeId: prIntake.id,
        fileAnalyses: [],
        relatedCodes: [],
        viewpointSeeds: [],
        summary: "test",
        analyzedAt: "2026-04-01T00:00:00Z",
      } satisfies ChangeAnalysisResult);
      saveTestMapping(result.databasePath, {
        prIntakeId: prIntake.id,
        changeAnalysisId: ca.id,
        testAssets: [],
        testSummaries: [],
        coverageGapMap: [],
        missingLayers: [],
        mappedAt: "2026-04-01T00:00:00Z",
      } satisfies TestMappingResult);

      await expect(exportArtifacts({ prIntakeId: 1, config })).rejects.toThrow(
        /Risk assessment not found.*assess-gaps/,
      );
    });

    it("rejects when session charters are missing", async () => {
      const workspace = await createTestWorkspace();
      workspaces.push(workspace.root);
      const result = await initializeWorkspace(
        workspace.configPath,
        workspace.manifestPath,
      );
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const prIntake = savePrIntake(
        result.databasePath,
        createSamplePrMetadata(),
      );
      const ca = saveChangeAnalysis(result.databasePath, {
        prIntakeId: prIntake.id,
        fileAnalyses: [],
        relatedCodes: [],
        viewpointSeeds: [],
        summary: "test",
        analyzedAt: "2026-04-01T00:00:00Z",
      } satisfies ChangeAnalysisResult);
      const tm = saveTestMapping(result.databasePath, {
        prIntakeId: prIntake.id,
        changeAnalysisId: ca.id,
        testAssets: [],
        testSummaries: [],
        coverageGapMap: [],
        missingLayers: [],
        mappedAt: "2026-04-01T00:00:00Z",
      } satisfies TestMappingResult);
      saveRiskAssessment(result.databasePath, {
        testMappingId: tm.id,
        riskScores: [],
        frameworkSelections: [],
        explorationThemes: [],
        assessedAt: "2026-04-01T00:00:00Z",
      } satisfies RiskAssessmentResult);

      await expect(exportArtifacts({ prIntakeId: 1, config })).rejects.toThrow(
        /Session charters not found.*generate-charters/,
      );
    });
  });

  it("scopes findings to the target PR chain only", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    // Build a complete second PR chain with its own findings
    const pr2 = savePrIntake(workspace.databasePath, {
      ...createSamplePrMetadata(),
      prNumber: 99,
      title: "Other PR",
      headSha: "xyz9999",
    });
    const ca2 = saveChangeAnalysis(workspace.databasePath, {
      prIntakeId: pr2.id,
      fileAnalyses: [],
      relatedCodes: [],
      viewpointSeeds: [],
      summary: "second PR",
      analyzedAt: "2026-04-01T00:00:00Z",
    } satisfies ChangeAnalysisResult);
    const tm2 = saveTestMapping(workspace.databasePath, {
      prIntakeId: pr2.id,
      changeAnalysisId: ca2.id,
      testAssets: [],
      testSummaries: [],
      coverageGapMap: [],
      missingLayers: [],
      mappedAt: "2026-04-01T00:00:00Z",
    } satisfies TestMappingResult);
    const ra2 = saveRiskAssessment(workspace.databasePath, {
      testMappingId: tm2.id,
      riskScores: [],
      frameworkSelections: [],
      explorationThemes: [],
      assessedAt: "2026-04-01T00:00:00Z",
    } satisfies RiskAssessmentResult);
    const sc2 = saveSessionCharters(workspace.databasePath, {
      riskAssessmentId: ra2.id,
      charters: [
        {
          title: "Other PR charter",
          goal: "Test other PR",
          scope: ["src/other.ts"],
          selectedFrameworks: ["error-guessing"],
          preconditions: [],
          observationTargets: [
            { category: "network", description: "Check other" },
          ],
          stopConditions: ["Done"],
          timeboxMinutes: 10,
        },
      ],
      generatedAt: "2026-04-01T00:00:00Z",
    } satisfies SessionCharterGenerationResult);
    const s2 = saveSession(workspace.databasePath, {
      sessionChartersId: sc2.id,
      charterIndex: 0,
      charterTitle: "Other PR charter",
    });
    updateSessionStatus(workspace.databasePath, {
      sessionId: s2.id,
      status: "in_progress",
      startedAt: "2026-04-01T11:00:00Z",
    });
    const obs2 = saveObservation(workspace.databasePath, {
      sessionId: s2.id,
      targetedHeuristic: "boundary",
      action: "Enter max value",
      expected: "Accepted",
      actual: "Accepted",
      outcome: "pass",
      note: "",
      evidencePath: null,
    });
    saveFinding(workspace.databasePath, {
      sessionId: s2.id,
      observationId: obs2.id,
      type: "defect",
      title: "LEAKED_FROM_OTHER_PR",
      description: "This should not appear in PR 1 export",
      severity: "low",
      recommendedTestLayer: null,
      automationRationale: null,
    });

    const result = await exportArtifacts({ prIntakeId: 1, config });
    const findingsContent = await readFile(
      result.artifacts.findingsReport,
      "utf8",
    );
    const chartersContent = await readFile(
      result.artifacts.sessionCharters,
      "utf8",
    );

    // PR 1 findings present
    expect(findingsContent).toContain("Crash on invalid credentials");
    // PR 2 finding NOT present
    expect(findingsContent).not.toContain("LEAKED_FROM_OTHER_PR");
    // PR 2 charter NOT present
    expect(chartersContent).not.toContain("Other PR charter");
  });

  it("includes intent context in exploration brief when available", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const intent: IntentContext = {
      changePurpose: "bugfix",
      userStory: "As a user, I see correct error messages on login failure",
      acceptanceCriteria: ["Error message shown for invalid password"],
      nonGoals: ["No UI redesign"],
      targetUsers: ["end-user"],
      notesForQa: ["Test with expired tokens"],
      sourceRefs: [],
      extractionStatus: "parsed",
    };
    saveIntentContext(workspace.databasePath, 1, intent);

    const result = await exportArtifacts({ prIntakeId: 1, config });
    const content = await readFile(result.artifacts.explorationBrief, "utf8");

    expect(content).toContain("## Intent Context");
    expect(content).toContain("bugfix");
    expect(content).toContain("correct error messages on login failure");
    expect(content).toContain("Error message shown for invalid password");
    expect(content).toContain("Test with expired tokens");
  });

  it("omits intent context section in brief when not available", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await exportArtifacts({ prIntakeId: 1, config });
    const content = await readFile(result.artifacts.explorationBrief, "utf8");

    expect(content).not.toContain("## Intent Context");
  });
});
