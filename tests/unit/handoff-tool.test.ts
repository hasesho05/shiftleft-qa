import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/exploratory-testing/scm/github-issues", () => ({
  createIssue: vi.fn(),
  editIssueBody: vi.fn(),
  addIssueComment: vi.fn(),
}));

import {
  countAllocationItemsByDestination,
  saveAllocationItems,
  saveChangeAnalysis,
  saveFinding,
  saveObservation,
  savePrIntake,
  saveRiskAssessment,
  saveSession,
  saveSessionCharters,
  saveTestMapping,
  updateSessionStatus,
} from "../../src/exploratory-testing/db/workspace-repository";
import { collectStabilityNotesFromTestMapping } from "../../src/exploratory-testing/lib/render-stability-notes";
import type { AllocationItem } from "../../src/exploratory-testing/models/allocation";
import type { ChangeAnalysisResult } from "../../src/exploratory-testing/models/change-analysis";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import type { RiskAssessmentResult } from "../../src/exploratory-testing/models/risk-assessment";
import type { SessionCharterGenerationResult } from "../../src/exploratory-testing/models/session-charter";
import type { TestMappingResult } from "../../src/exploratory-testing/models/test-mapping";
import {
  addIssueComment,
  createIssue,
  editIssueBody,
} from "../../src/exploratory-testing/scm/github-issues";
import {
  generateHandoffMarkdown,
  groupBySection,
  renderFindingsComment,
  renderHandoffMarkdown,
  runAddHandoffComment,
  runCreateHandoffIssue,
  runUpdateHandoffIssue,
} from "../../src/exploratory-testing/tools/handoff";
import { readStepHandoverDocument } from "../../src/exploratory-testing/tools/progress";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import type { generateTriageReport } from "../../src/exploratory-testing/tools/triage-findings";
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
    title: "Payment retry | handoff",
    description: "Implements retry behavior",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/payment-retry",
    headSha: "abc1234",
    linkedIssues: [],
    changedFiles: [
      {
        path: "src/clients/payment-gateway.ts",
        status: "modified",
        additions: 20,
        deletions: 4,
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
        path: "src/clients/payment-gateway.ts",
        status: "modified",
        additions: 20,
        deletions: 4,
        categories: [
          { category: "api", confidence: 0.8, reason: "Gateway client" },
          { category: "async", confidence: 0.8, reason: "Retry timing" },
        ],
      },
    ],
    relatedCodes: [],
    viewpointSeeds: [],
    summary: "1 file analyzed",
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
    testAssets: [],
    testSummaries: [],
    coverageGapMap: [
      {
        changedFilePath: "src/clients/payment-gateway.ts",
        aspect: "error-path",
        status: "uncovered",
        coveredBy: [],
        explorationPriority: "high",
        stabilityNotes: [],
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
        changedFilePath: "src/clients/payment-gateway.ts",
        overallRisk: 0.9,
        factors: [{ factor: "cross-service", weight: 0.5, contribution: 0.45 }],
      },
    ],
    frameworkSelections: [],
    explorationThemes: [],
    assessedAt: "2026-04-01T00:00:00Z",
  };
}

function createAllocationItems(riskAssessmentId: number): AllocationItem[] {
  return [
    {
      riskAssessmentId,
      title: "Covered auth guard",
      changedFilePaths: ["src/api/orders.ts"],
      riskLevel: "low",
      recommendedDestination: "review",
      confidence: 0.9,
      rationale: "Reviewed in code review",
      sourceSignals: {
        categories: ["permission"],
        existingTestLayers: [],
        gapAspects: ["permission"],
        reviewComments: [],
        riskSignals: ["review"],
      },
    },
    {
      riskAssessmentId,
      title: "Retry boundary | automation",
      changedFilePaths: ["src/clients/payment-gateway.ts"],
      riskLevel: "high",
      recommendedDestination: "integration",
      confidence: 0.86,
      rationale: "Boundary + retry should be integration tested",
      sourceSignals: {
        categories: ["api", "async"],
        existingTestLayers: [],
        gapAspects: ["boundary"],
        reviewComments: [],
        riskSignals: ["integration"],
      },
    },
    {
      riskAssessmentId,
      title: "Retry timeout newline\nneeds hands-on",
      changedFilePaths: ["src/clients/payment-gateway.ts"],
      riskLevel: "high",
      recommendedDestination: "manual-exploration",
      confidence: 0.35,
      rationale: "Timeout | stale state\nneeds observation",
      sourceSignals: {
        categories: ["async"],
        existingTestLayers: [],
        gapAspects: ["error-path"],
        reviewComments: [],
        riskSignals: ["manual"],
      },
    },
  ];
}

describe("handoff tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  function seedHandoffPipeline(databasePath: string): {
    riskAssessmentId: number;
    sessionId: number;
    prIntake: ReturnType<typeof savePrIntake>;
  } {
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
    saveAllocationItems(
      databasePath,
      riskAssessment.id,
      createAllocationItems(riskAssessment.id),
    );

    const sessionCharters = saveSessionCharters(databasePath, {
      riskAssessmentId: riskAssessment.id,
      charters: [
        {
          title: "Retry resilience",
          goal: "Observe timeout behavior",
          scope: ["src/clients/payment-gateway.ts"],
          selectedFrameworks: ["error-guessing"],
          preconditions: [],
          observationTargets: [
            {
              category: "network",
              description: "Observe timeout and retry requests",
            },
          ],
          stopConditions: ["Timebox elapsed"],
          timeboxMinutes: 20,
        },
      ],
      generatedAt: "2026-04-01T00:00:00Z",
    } satisfies SessionCharterGenerationResult);

    const session = saveSession(databasePath, {
      sessionChartersId: sessionCharters.id,
      charterIndex: 0,
      charterTitle: "Retry resilience",
    });
    updateSessionStatus(databasePath, {
      sessionId: session.id,
      status: "completed",
      startedAt: "2026-04-01T10:00:00Z",
      completedAt: "2026-04-01T10:20:00Z",
    });

    const observationOne = saveObservation(databasePath, {
      sessionId: session.id,
      targetedHeuristic: "error-guessing",
      action: "Trigger gateway timeout",
      expected: "Single retry request",
      actual: "Duplicate retry request",
      outcome: "fail",
      note: "",
      evidencePath: null,
    });

    const observationTwo = saveObservation(databasePath, {
      sessionId: session.id,
      targetedHeuristic: "boundary-value-analysis",
      action: "Retry after timeout",
      expected: "Stable contract behavior",
      actual: "Needs automated coverage",
      outcome: "suspicious",
      note: "",
      evidencePath: null,
    });

    saveFinding(databasePath, {
      sessionId: session.id,
      observationId: observationOne.id,
      type: "defect",
      title: "Duplicate retry request",
      description: "Observed duplicate request after timeout",
      severity: "high",
      recommendedTestLayer: null,
      automationRationale: null,
    });

    saveFinding(databasePath, {
      sessionId: session.id,
      observationId: observationTwo.id,
      type: "automation-candidate",
      title: "Retry backoff contract",
      description: "Should be pinned with integration coverage",
      severity: "medium",
      recommendedTestLayer: "integration",
      automationRationale: "Gateway timeout path is deterministic enough",
    });

    return {
      riskAssessmentId: riskAssessment.id,
      sessionId: session.id,
      prIntake,
    };
  }

  it("groups allocation items into the expected handoff sections", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedHandoffPipeline(workspace.databasePath);
    const items = saveAllocationItems(
      workspace.databasePath,
      riskAssessmentId,
      createAllocationItems(riskAssessmentId),
    );

    const sections = groupBySection(items);

    expect(sections.alreadyCovered).toHaveLength(1);
    expect(sections.shouldAutomate).toHaveLength(1);
    expect(sections.manualExploration).toHaveLength(1);
  });

  it("generates markdown from allocation items with escaped markdown-sensitive content", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedHandoffPipeline(workspace.databasePath);

    const result = await generateHandoffMarkdown({
      riskAssessmentId,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect(result.summary.totalItems).toBe(3);
    expect(result.markdown).toContain("### ✅ Already Covered");
    expect(result.markdown).toContain("### 🔧 Should Automate");
    expect(result.markdown).toContain("### 🔍 Manual Exploration Required");
    expect(result.markdown).toContain(
      "Timeout \\| stale state<br>needs observation",
    );
  });

  it("publishes a generated handoff issue via the gh wrapper", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedHandoffPipeline(workspace.databasePath);
    vi.mocked(createIssue).mockResolvedValue({
      number: 42,
      url: "https://github.com/owner/repo/issues/42",
      title: "QA: PR #42 — handoff checklist",
    });

    const result = await runCreateHandoffIssue({
      riskAssessmentId,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
      labels: ["qa-handoff"],
    });

    expect(vi.mocked(createIssue)).toHaveBeenCalledOnce();
    expect(vi.mocked(createIssue)).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: workspace.root,
        repository: "owner/repo",
        labels: ["qa-handoff"],
        body: expect.stringContaining("Manual Exploration Required"),
      }),
    );
    expect(result.issue.number).toBe(42);

    const handover = await readStepHandoverDocument(
      `${workspace.root}/.exploratory-testing/progress/07-handoff.md`,
    );
    expect(handover.frontmatter.step_name).toBe("handoff");
    expect(handover.frontmatter.status).toBe("completed");
    expect(handover.body).toContain("Issue Number");
    expect(handover.body).toContain("generate-charters");
  });

  it("updates an existing issue body from allocation data", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedHandoffPipeline(workspace.databasePath);
    vi.mocked(editIssueBody).mockResolvedValue(undefined);

    const result = await runUpdateHandoffIssue({
      riskAssessmentId,
      issueNumber: 77,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect(vi.mocked(editIssueBody)).toHaveBeenCalledOnce();
    expect(vi.mocked(editIssueBody)).toHaveBeenCalledWith(
      expect.objectContaining({
        issueNumber: 77,
        repositoryRoot: workspace.root,
        body: expect.stringContaining("Should Automate"),
      }),
    );
    expect(result.issueNumber).toBe(77);

    const handover = await readStepHandoverDocument(
      `${workspace.root}/.exploratory-testing/progress/07-handoff.md`,
    );
    expect(handover.frontmatter.step_name).toBe("handoff");
    expect(handover.frontmatter.status).toBe("completed");
    expect(handover.body).toContain("Issue Number");
  });

  it("renders findings and posts them as a comment", async () => {
    const workspace = await setupWorkspace();
    const { sessionId } = seedHandoffPipeline(workspace.databasePath);
    vi.mocked(addIssueComment).mockResolvedValue({
      url: "https://github.com/owner/repo/issues/42#issuecomment-1",
    });

    const result = await runAddHandoffComment({
      issueNumber: 42,
      sessionId,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect(vi.mocked(addIssueComment)).toHaveBeenCalledOnce();
    expect(result.body).toContain("Duplicate retry request");
    expect(result.body).toContain("Recommended layer");
    expect(result.comment.url).toContain("issuecomment-1");
  });

  it("renders a no-findings comment when the triage report is empty", async () => {
    const session = {
      id: 1,
      sessionChartersId: 1,
      charterIndex: 0,
      charterTitle: "Retry resilience",
      status: "completed",
      startedAt: null,
      interruptedAt: null,
      completedAt: null,
      interruptReason: null,
      createdAt: "2026-04-01T00:00:00Z",
      updatedAt: "2026-04-01T00:00:00Z",
    } as const;
    const report = {
      sessionId: 1,
      totalFindings: 0,
      countByType: {
        defect: 0,
        "spec-gap": 0,
        "automation-candidate": 0,
      },
      countBySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      findings: [],
    } satisfies Awaited<ReturnType<typeof generateTriageReport>>;

    expect(renderFindingsComment(session, report)).toContain(
      "_No findings from this session._",
    );
  });

  it("renders confidence bucket and hypothesis disclaimer in handoff markdown", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedHandoffPipeline(workspace.databasePath);

    const result = await generateHandoffMarkdown({
      riskAssessmentId,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    // Hypothesis framing disclaimer
    expect(result.markdown).toContain(
      "heuristic recommendations derived from code, diff, and test analysis",
    );

    // Covered section shows confidence
    expect(result.markdown).toMatch(/Covered auth guard.*🟢 high/);

    // Automation section shows confidence
    expect(result.markdown).toMatch(/Retry boundary.*🟢 high/);

    // Manual section shows confidence
    expect(result.markdown).toMatch(/Retry timeout.*🔴 low/);
  });

  it("includes intent context section in markdown when available", async () => {
    const workspace = await setupWorkspace();
    const { prIntake } = seedHandoffPipeline(workspace.databasePath);

    const intent: IntentContext = {
      changePurpose: "bugfix",
      userStory: "As a merchant, I see correct retry behavior",
      acceptanceCriteria: ["Retry count shown in logs"],
      nonGoals: ["No UI changes"],
      targetUsers: ["merchant"],
      notesForQa: ["Test with flaky network"],
      sourceRefs: [],
      extractionStatus: "parsed",
    };

    const sections = groupBySection([]);
    const summary = {
      totalItems: 0,
      manualCount: 0,
      automateCount: 0,
      coveredCount: 0,
    };

    const markdown = renderHandoffMarkdown(
      prIntake,
      1,
      { sections, summary },
      intent,
    );

    expect(markdown).toContain("### PR Intent Context");
    expect(markdown).toContain("bugfix");
    expect(markdown).toContain("correct retry behavior");
    expect(markdown).toContain("Retry count shown in logs");
    expect(markdown).toContain("Test with flaky network");
  });

  it("omits intent context section when not provided", async () => {
    const workspace = await setupWorkspace();
    const { prIntake } = seedHandoffPipeline(workspace.databasePath);

    const sections = groupBySection([]);
    const summary = {
      totalItems: 0,
      manualCount: 0,
      automateCount: 0,
      coveredCount: 0,
    };

    const markdown = renderHandoffMarkdown(prIntake, 1, { sections, summary });

    expect(markdown).not.toContain("### PR Intent Context");
  });

  it("renders layer applicability notes so non-primary layers are not mistaken for missing work", async () => {
    const workspace = await setupWorkspace();
    const prIntake = savePrIntake(workspace.databasePath, {
      provider: "github",
      repository: "owner/repo",
      prNumber: 88,
      title: "Refresh button visuals",
      description: "Frontend-only component update",
      author: "alice",
      baseBranch: "main",
      headBranch: "feature/button-visual-refresh",
      headSha: "123abcd",
      linkedIssues: [],
      changedFiles: [
        {
          path: "src/components/Button.tsx",
          status: "modified",
          additions: 10,
          deletions: 3,
          previousPath: null,
        },
        {
          path: "src/components/Button.test.tsx",
          status: "modified",
          additions: 8,
          deletions: 1,
          previousPath: null,
        },
        {
          path: "src/components/Button.stories.tsx",
          status: "modified",
          additions: 7,
          deletions: 0,
          previousPath: null,
        },
      ],
      reviewComments: [],
      fetchedAt: "2026-04-05T00:00:00Z",
    });
    const changeAnalysis = saveChangeAnalysis(workspace.databasePath, {
      prIntakeId: prIntake.id,
      fileAnalyses: [
        {
          path: "src/components/Button.tsx",
          status: "modified",
          additions: 10,
          deletions: 3,
          categories: [
            { category: "ui", confidence: 0.9, reason: "tsx component" },
          ],
        },
      ],
      relatedCodes: [],
      viewpointSeeds: [],
      summary: "frontend-only component change",
      analyzedAt: "2026-04-05T00:00:00Z",
    });
    const testMapping = saveTestMapping(workspace.databasePath, {
      prIntakeId: prIntake.id,
      changeAnalysisId: changeAnalysis.id,
      testAssets: [],
      testSummaries: [],
      coverageGapMap: [
        {
          changedFilePath: "src/components/Button.tsx",
          aspect: "boundary",
          status: "uncovered",
          coveredBy: [],
          explorationPriority: "medium",
          stabilityNotes: [],
        },
      ],
      missingLayers: ["e2e", "visual", "api"],
      mappedAt: "2026-04-05T00:00:00Z",
    });
    const riskAssessment = saveRiskAssessment(workspace.databasePath, {
      testMappingId: testMapping.id,
      riskScores: [
        {
          changedFilePath: "src/components/Button.tsx",
          overallRisk: 0.4,
          factors: [{ factor: "ui-change", weight: 0.4, contribution: 0.16 }],
        },
      ],
      frameworkSelections: [],
      explorationThemes: [],
      assessedAt: "2026-04-05T00:00:00Z",
    });
    saveAllocationItems(workspace.databasePath, riskAssessment.id, [
      {
        riskAssessmentId: riskAssessment.id,
        title: "Button props",
        changedFilePaths: ["src/components/Button.tsx"],
        riskLevel: "medium",
        recommendedDestination: "unit",
        confidence: 0.82,
        rationale: "Component logic is deterministic",
        sourceSignals: {
          categories: ["ui"],
          existingTestLayers: [],
          gapAspects: ["boundary"],
          reviewComments: [],
          riskSignals: [],
        },
      },
      {
        riskAssessmentId: riskAssessment.id,
        title: "Button render",
        changedFilePaths: ["src/components/Button.tsx"],
        riskLevel: "medium",
        recommendedDestination: "visual",
        confidence: 0.79,
        rationale: "Rendering diff should be checked visually",
        sourceSignals: {
          categories: ["ui"],
          existingTestLayers: [],
          gapAspects: ["happy-path"],
          reviewComments: [],
          riskSignals: [],
        },
      },
    ]);

    const result = await generateHandoffMarkdown({
      riskAssessmentId: riskAssessment.id,
      configPath: workspace.configPath,
      manifestPath: workspace.manifestPath,
    });

    expect(result.markdown).toContain("### Layer Applicability");
    expect(result.markdown).toContain("**integration/service**: `not-primary`");
    expect(result.markdown).toContain(
      "差分は UI / asset 中心で、service boundary を跨ぐ変更 signal は強くありません。",
    );
    expect(result.markdown).toContain("**visual**: `primary`");
  });

  it("renders stability notes section when flaky tests exist", () => {
    const prIntake = {
      provider: "github" as const,
      repository: "owner/repo",
      prNumber: 42,
      title: "Payment retry",
      description: "",
      author: "dev",
      baseBranch: "main",
      headBranch: "feature",
      headSha: "abc123",
      linkedIssues: [],
      changedFiles: [],
      reviewComments: [],
    };

    const markdown = renderHandoffMarkdown(
      prIntake as unknown as Parameters<typeof renderHandoffMarkdown>[0],
      1,
      {
        sections: {
          alreadyCovered: [],
          shouldAutomate: [],
          manualExploration: [],
        },
        summary: {
          totalItems: 0,
          manualCount: 0,
          automateCount: 0,
          coveredCount: 0,
        },
        stabilityNotes: [
          {
            testPath: "tests/e2e/flaky/order.spec.ts",
            stability: "flaky",
            signals: ["path:flaky"],
            note: "このテストは不安定な挙動が報告されています",
          },
        ],
      },
    );

    expect(markdown).toContain("### ⚠ 既存テストの注意点");
    expect(markdown).toContain("tests/e2e/flaky/order.spec.ts");
    expect(markdown).toContain("不安定な挙動");
    expect(markdown).toContain("手動確認を優先する");
  });

  it("omits stability notes section when no unstable tests exist", () => {
    const prIntake = {
      provider: "github" as const,
      repository: "owner/repo",
      prNumber: 42,
      title: "Clean PR",
      description: "",
      author: "dev",
      baseBranch: "main",
      headBranch: "feature",
      headSha: "abc123",
      linkedIssues: [],
      changedFiles: [],
      reviewComments: [],
    };

    const markdown = renderHandoffMarkdown(
      prIntake as unknown as Parameters<typeof renderHandoffMarkdown>[0],
      1,
      {
        sections: {
          alreadyCovered: [],
          shouldAutomate: [],
          manualExploration: [],
        },
        summary: {
          totalItems: 0,
          manualCount: 0,
          automateCount: 0,
          coveredCount: 0,
        },
        stabilityNotes: [],
      },
    );

    expect(markdown).not.toContain("既存テストの注意点");
  });

  it("collectStabilityNotesFromTestMapping extracts flaky and quarantined assets", () => {
    const testMapping = {
      id: 1,
      prIntakeId: 1,
      changeAnalysisId: 1,
      testAssets: [
        {
          path: "tests/unit/auth.test.ts",
          layer: "unit" as const,
          relatedTo: ["src/auth.ts"],
          confidence: 0.9,
          stability: "stable" as const,
          stabilitySignals: [],
          stabilityNotes: [],
        },
        {
          path: "tests/e2e/flaky/order.spec.ts",
          layer: "e2e" as const,
          relatedTo: ["src/order.ts"],
          confidence: 0.7,
          stability: "flaky" as const,
          stabilitySignals: ["path:flaky"],
          stabilityNotes: [],
        },
        {
          path: "tests/quarantine/payment.spec.ts",
          layer: "unit" as const,
          relatedTo: ["src/payment.ts"],
          confidence: 0.8,
          stability: "quarantined" as const,
          stabilitySignals: ["path:quarantine"],
          stabilityNotes: ["決済 API のタイムアウトが環境依存"],
        },
      ],
      testSummaries: [],
      coverageGapMap: [],
      missingLayers: [],
      mappedAt: "2026-04-05T00:00:00Z",
      createdAt: "2026-04-05T00:00:00Z",
      updatedAt: "2026-04-05T00:00:00Z",
    };

    const notes = collectStabilityNotesFromTestMapping(testMapping);

    expect(notes).toHaveLength(2);
    expect(notes[0].testPath).toBe("tests/e2e/flaky/order.spec.ts");
    expect(notes[0].stability).toBe("flaky");
    expect(notes[1].testPath).toBe("tests/quarantine/payment.spec.ts");
    expect(notes[1].stability).toBe("quarantined");
    expect(notes[1].note).toContain("決済 API");
  });

  it("collectStabilityNotesFromTestMapping returns empty for all stable", () => {
    const testMapping = {
      id: 1,
      prIntakeId: 1,
      changeAnalysisId: 1,
      testAssets: [
        {
          path: "tests/unit/auth.test.ts",
          layer: "unit" as const,
          relatedTo: ["src/auth.ts"],
          confidence: 0.9,
          stability: "unknown" as const,
          stabilitySignals: [],
          stabilityNotes: [],
        },
      ],
      testSummaries: [],
      coverageGapMap: [],
      missingLayers: [],
      mappedAt: "2026-04-05T00:00:00Z",
      createdAt: "2026-04-05T00:00:00Z",
      updatedAt: "2026-04-05T00:00:00Z",
    };

    const notes = collectStabilityNotesFromTestMapping(testMapping);
    expect(notes).toHaveLength(0);
  });

  it("renders quarantined handling note differently from flaky", () => {
    const prIntake = {
      provider: "github" as const,
      repository: "owner/repo",
      prNumber: 42,
      title: "PR",
      description: "",
      author: "dev",
      baseBranch: "main",
      headBranch: "feature",
      headSha: "abc123",
      linkedIssues: [],
      changedFiles: [],
      reviewComments: [],
    };

    const markdown = renderHandoffMarkdown(
      prIntake as unknown as Parameters<typeof renderHandoffMarkdown>[0],
      1,
      {
        sections: {
          alreadyCovered: [],
          shouldAutomate: [],
          manualExploration: [],
        },
        summary: {
          totalItems: 0,
          manualCount: 0,
          automateCount: 0,
          coveredCount: 0,
        },
        stabilityNotes: [
          {
            testPath: "tests/quarantine/payment.spec.ts",
            stability: "quarantined",
            signals: ["path:quarantine"],
            note: "このテストは現在 quarantine 扱いです",
          },
        ],
      },
    );

    expect(markdown).toContain("quarantine 扱い");
    expect(markdown).toContain("依存しないこと");
  });

  it("builds destination counts consistent with the saved allocation data", async () => {
    const workspace = await setupWorkspace();
    const { riskAssessmentId } = seedHandoffPipeline(workspace.databasePath);

    expect(
      countAllocationItemsByDestination(
        workspace.databasePath,
        riskAssessmentId,
      ),
    ).toEqual({
      review: 1,
      unit: 0,
      integration: 1,
      e2e: 0,
      visual: 0,
      "dev-box": 0,
      "manual-exploration": 1,
      skip: 0,
    });
  });
});
