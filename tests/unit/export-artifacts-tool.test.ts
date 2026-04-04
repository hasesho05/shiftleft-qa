import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  saveAllocationItems,
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
import type { AllocationItem } from "../../src/exploratory-testing/models/allocation";
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
  createSampleAllocationItems,
  createSamplePrMetadata,
  seedSessionCharters,
  seedSessionChartersWithAllocations,
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

  it("exports all 6 artifact files", async () => {
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
    expect(result.artifacts.heuristicFeedbackReport).toMatch(
      /heuristic-feedback-report\.md$/,
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

  it("includes guarantee-oriented layer summary in exploration brief", async () => {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    const { riskAssessmentId } = seedSessionCharters(result.databasePath);

    const allocationItems: AllocationItem[] = [
      {
        riskAssessmentId,
        title: "Auth validation rules",
        changedFilePaths: ["src/domain/auth-rules.ts"],
        riskLevel: "medium",
        recommendedDestination: "unit",
        confidence: 0.84,
        rationale: "Deterministic branching can be pinned before QA handoff",
        sourceSignals: {
          categories: ["validation", "state-transition"],
          existingTestLayers: [],
          gapAspects: ["boundary", "state-transition"],
          reviewComments: [],
          riskSignals: [],
          reasoningSummary:
            "Validation and branching are deterministic enough to lock down with unit tests.",
          alternativeDestinations: ["integration"],
          openQuestions: [],
        },
      },
      {
        riskAssessmentId,
        title: "Auth repository retry handling",
        changedFilePaths: ["src/repositories/auth-repository.ts"],
        riskLevel: "high",
        recommendedDestination: "integration",
        confidence: 0.79,
        rationale:
          "Repository and client coordination should be exercised across boundaries",
        sourceSignals: {
          categories: ["api", "cross-service"],
          existingTestLayers: [],
          gapAspects: ["error-path", "mock-fixture"],
          reviewComments: [],
          riskSignals: [],
          reasoningSummary:
            "Repository, client, and retry behavior are boundary concerns that should be checked together.",
          alternativeDestinations: ["manual-exploration"],
          openQuestions: ["Does retry stop after the final timeout?"],
        },
      },
      {
        riskAssessmentId,
        title: "Login route happy path",
        changedFilePaths: ["src/routes/login.tsx"],
        riskLevel: "medium",
        recommendedDestination: "e2e",
        confidence: 0.82,
        rationale: "Primary end-user flow should be exercised in the browser",
        sourceSignals: {
          categories: ["ui"],
          existingTestLayers: [],
          gapAspects: ["happy-path"],
          reviewComments: [],
          riskSignals: [],
          reasoningSummary:
            "Route-level interaction and rendering need end-user flow coverage instead of manual-only checking.",
          alternativeDestinations: ["visual"],
          openQuestions: [],
        },
      },
      {
        riskAssessmentId,
        title: "Ambiguous lockout messaging",
        changedFilePaths: ["src/routes/login.tsx"],
        riskLevel: "high",
        recommendedDestination: "manual-exploration",
        confidence: 0.61,
        rationale:
          "Timing and interpretation remain ambiguous after automation",
        sourceSignals: {
          categories: ["ui", "permission"],
          existingTestLayers: [],
          gapAspects: ["error-path", "permission"],
          reviewComments: [],
          riskSignals: [],
          reasoningSummary:
            "Automation can cover the base path, but lockout timing and copy interpretation still need human judgement.",
          alternativeDestinations: ["e2e"],
          openQuestions: [
            "Is the lockout explanation understandable under repeated failures?",
          ],
          manualRemainder:
            "UX wording and timing overlap are still ambiguous after the deterministic checks.",
        },
      },
    ];
    saveAllocationItems(result.databasePath, riskAssessmentId, allocationItems);

    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const exportResult = await exportArtifacts({ prIntakeId: 1, config });
    const content = await readFile(
      exportResult.artifacts.explorationBrief,
      "utf8",
    );

    expect(content).toContain("## Guarantee-Oriented Layer Summary");
    expect(content).toContain("### 単体テストで保証したいこと");
    expect(content).toContain(
      "### 統合テスト / サービステストで保証したいこと",
    );
    expect(content).toContain("### UI / E2E テストで保証したいこと");
    expect(content).toContain("### 手動探索で見ること");
    expect(content).toContain("この層に寄せる理由");
    expect(content).toContain("手動探索に残す理由");
  });

  it("reflects intent wording in guarantee-oriented layer summary when available", async () => {
    const workspace = await setupWorkspaceWithFullPipeline();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const intent: IntentContext = {
      changePurpose: "bugfix",
      userStory:
        "As a user, I can retry login without confusing lockout behavior",
      acceptanceCriteria: [
        "Lockout message is shown after repeated failures",
        "Expired token errors are recoverable",
      ],
      nonGoals: [],
      targetUsers: ["end-user"],
      notesForQa: ["Focus on repeated failures and lockout copy"],
      sourceRefs: [],
      extractionStatus: "parsed",
    };
    saveIntentContext(workspace.databasePath, 1, intent);

    const result = await exportArtifacts({ prIntakeId: 1, config });
    const content = await readFile(result.artifacts.explorationBrief, "utf8");

    expect(content).toContain("この summary は");
    expect(content).toContain(
      "Lockout message is shown after repeated failures",
    );
    expect(content).toContain(
      "As a user, I can retry login without confusing lockout behavior",
    );
  });

  describe("heuristic feedback report", () => {
    async function setupWithAllocations(): Promise<
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

      const { sessionChartersId } =
        seedSessionChartersWithAllocations(databasePath);

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

    it("exports heuristic feedback report as artifact", async () => {
      const workspace = await setupWithAllocations();
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const result = await exportArtifacts({ prIntakeId: 1, config });

      expect(result.artifacts.heuristicFeedbackReport).toMatch(
        /heuristic-feedback-report\.md$/,
      );
    });

    it("attributes findings only to manual-exploration destination", async () => {
      const workspace = await setupWithAllocations();
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const result = await exportArtifacts({ prIntakeId: 1, config });
      const content = await readFile(
        result.artifacts.heuristicFeedbackReport,
        "utf8",
      );

      expect(content).toContain("# Heuristic Feedback Report");
      expect(content).toContain("## Findings by Allocation Destination");
      // manual-exploration has 1 item and 2 findings
      expect(content).toContain("| manual-exploration | 1 | 2 |");
      // review has 1 item but 0 findings (not explored)
      expect(content).toContain("| review | 1 | 0 |");
      // unit has 1 item but 0 findings (not explored)
      expect(content).toContain("| unit | 1 | 0 |");
    });

    it("attributes confidence bucket only from manual-exploration items", async () => {
      const workspace = await setupWithAllocations();
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const result = await exportArtifacts({ prIntakeId: 1, config });
      const content = await readFile(
        result.artifacts.heuristicFeedbackReport,
        "utf8",
      );

      expect(content).toContain("## Findings by Confidence Bucket");
      // manual-exploration item has confidence 0.85 = high bucket, 2 findings
      expect(content).toContain("| high | 1 | 2 |");
      // medium bucket has 1 item (unit, confidence 0.7) but 0 findings
      expect(content).toContain("| medium | 1 | 0 |");
      // low bucket has 1 item (review, confidence 0.4) but 0 findings
      expect(content).toContain("| low | 1 | 0 |");
    });

    it("attributes gap aspects only from manual-exploration items", async () => {
      const workspace = await setupWithAllocations();
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const result = await exportArtifacts({ prIntakeId: 1, config });
      const content = await readFile(
        result.artifacts.heuristicFeedbackReport,
        "utf8",
      );

      expect(content).toContain("## Findings by Gap Aspect");
      // manual-exploration item has gapAspects: ["error-path", "permission"]
      expect(content).toContain("| error-path | 2 |");
      expect(content).toContain("| permission | 2 |");
      // "boundary" is only on the unit item — should NOT appear
      expect(content).not.toContain("| boundary |");
      // "happy-path" is only on the review item — should NOT appear
      expect(content).not.toContain("| happy-path |");
    });

    it("contains findings-by-charter section", async () => {
      const workspace = await setupWithAllocations();
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const result = await exportArtifacts({ prIntakeId: 1, config });
      const content = await readFile(
        result.artifacts.heuristicFeedbackReport,
        "utf8",
      );

      expect(content).toContain("## Findings by Charter");
      expect(content).toContain("Auth error handling");
    });

    it("contains findings-by-framework section", async () => {
      const workspace = await setupWithAllocations();
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const result = await exportArtifacts({ prIntakeId: 1, config });
      const content = await readFile(
        result.artifacts.heuristicFeedbackReport,
        "utf8",
      );

      expect(content).toContain("## Findings by Framework");
      // charter has selectedFrameworks: ["error-guessing", "boundary-value-analysis"]
      expect(content).toContain("| boundary-value-analysis | 2 |");
      expect(content).toContain("| error-guessing | 2 |");
    });

    it("shows empty findings when no findings exist", async () => {
      const workspace = await createTestWorkspace();
      workspaces.push(workspace.root);
      const result = await initializeWorkspace(
        workspace.configPath,
        workspace.manifestPath,
      );
      const { sessionChartersId } = seedSessionChartersWithAllocations(
        result.databasePath,
      );

      // Session but no findings
      const session = saveSession(result.databasePath, {
        sessionChartersId,
        charterIndex: 0,
        charterTitle: "Auth error handling",
      });
      updateSessionStatus(result.databasePath, {
        sessionId: session.id,
        status: "completed",
        completedAt: "2026-04-01T10:30:00Z",
      });

      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );
      const exportResult = await exportArtifacts({ prIntakeId: 1, config });
      const content = await readFile(
        exportResult.artifacts.heuristicFeedbackReport,
        "utf8",
      );

      expect(content).toContain("# Heuristic Feedback Report");
      expect(content).toContain("**Total findings**: 0");
    });

    it("includes report path in handover summary", async () => {
      const workspace = await setupWithAllocations();
      const config = await readPluginConfig(
        workspace.configPath,
        workspace.manifestPath,
      );

      const result = await exportArtifacts({ prIntakeId: 1, config });
      const handoverContent = await readFile(result.handover.filePath, "utf8");

      expect(handoverContent).toContain("heuristic-feedback-report");
    });
  });
});
