/**
 * Skill-contract E2E test for the skill-first workflow.
 *
 * Unlike `full-pipeline.test.ts` (tool-chain integration / heuristic regression),
 * this test validates the **skill workflow contract**:
 *
 *   - setup initialises local state, progress, and current step correctly
 *   - step transitions follow the workflow definition
 *   - handover / progress files serve as skill re-entry material
 *   - pr-intake intent context propagates to downstream steps
 *   - only manual-exploration items feed into generate-charters
 *   - handoff output carries confidence-based hypothesis
 *   - export-artifacts includes guarantee-oriented layer summary and
 *     heuristic feedback report
 *
 * Uses the "Task Board" sample app fixture (tests/e2e/fixtures/sample-app/).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { WORKFLOW_SKILLS } from "../../src/exploratory-testing/config/workflow";
import {
  findIntentContext,
  listAllocationItemsByDestination,
  listObservations,
  listStepProgressSnapshots,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { ResolvedPluginConfig } from "../../src/exploratory-testing/models/config";
import { runAllocate } from "../../src/exploratory-testing/tools/allocate";
import type { AllocateResult } from "../../src/exploratory-testing/tools/allocate";
import { runAssessGapsFromMapping } from "../../src/exploratory-testing/tools/assess-gaps";
import type { AssessGapsResult } from "../../src/exploratory-testing/tools/assess-gaps";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
import type { DiscoverContextResult } from "../../src/exploratory-testing/tools/discover-context";
import { exportArtifacts } from "../../src/exploratory-testing/tools/export-artifacts";
import type { ExportArtifactsResult } from "../../src/exploratory-testing/tools/export-artifacts";
import { runGenerateChartersFromAllocation } from "../../src/exploratory-testing/tools/generate-charters";
import type { GenerateChartersResult } from "../../src/exploratory-testing/tools/generate-charters";
import { generateHandoffMarkdown } from "../../src/exploratory-testing/tools/handoff";
import type { HandoffMarkdownResult } from "../../src/exploratory-testing/tools/handoff";
import { runMapTestsFromAnalysis } from "../../src/exploratory-testing/tools/map-tests";
import type { MapTestsResult } from "../../src/exploratory-testing/tools/map-tests";
import { savePrIntakeResult } from "../../src/exploratory-testing/tools/pr-intake";
import type { PrIntakeResult } from "../../src/exploratory-testing/tools/pr-intake";
import {
  readProgressSummaryDocument,
  readStepHandoverDocument,
} from "../../src/exploratory-testing/tools/progress";
import {
  addSessionObservation,
  completeSession,
  startSession,
} from "../../src/exploratory-testing/tools/run-session";
import type { StartSessionResult } from "../../src/exploratory-testing/tools/run-session";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  addFinding,
  writeTriageHandover,
} from "../../src/exploratory-testing/tools/triage-findings";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspaceWithSampleApp,
} from "../helpers/workspace";
import { createSampleAppPrMetadata } from "./fixtures/sample-app-pr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkillPipelineResult = {
  readonly config: ResolvedPluginConfig;
  readonly databasePath: string;
  readonly prIntake: PrIntakeResult;
  readonly context: DiscoverContextResult;
  readonly mapping: MapTestsResult;
  readonly assess: AssessGapsResult;
  readonly allocate: AllocateResult;
  readonly handoffMarkdown: HandoffMarkdownResult;
  readonly charters: GenerateChartersResult;
  readonly session: StartSessionResult;
  readonly exportResult: ExportArtifactsResult;
};

// ---------------------------------------------------------------------------
// Pipeline helper — mirrors skill-first workflow
// ---------------------------------------------------------------------------

async function runSkillPipeline(
  workspace: TestWorkspace,
): Promise<SkillPipelineResult> {
  // Step 1: setup
  const setupResult = await initializeWorkspace(
    workspace.configPath,
    workspace.manifestPath,
  );
  const { databasePath } = setupResult;
  const config = await readPluginConfig(
    workspace.configPath,
    workspace.manifestPath,
  );

  // Step 2: pr-intake
  const prIntake = await savePrIntakeResult(
    createSampleAppPrMetadata(),
    databasePath,
    config,
  );

  // Step 3: discover-context
  const context = await runDiscoverContextFromIntake(
    prIntake.persisted,
    config,
  );

  // Step 4: map-tests
  const mapping = await runMapTestsFromAnalysis(
    context.persisted,
    prIntake.persisted,
    config,
  );

  // Step 5: assess-gaps
  const assess = await runAssessGapsFromMapping(
    mapping.persisted,
    context.persisted,
    config,
  );

  // Step 6: allocate
  const allocateResult = await runAllocate({
    riskAssessmentId: assess.persisted.id,
    configPath: workspace.configPath,
    manifestPath: workspace.manifestPath,
  });

  // Step 7: handoff — generate markdown (publish to GitHub is skipped)
  const handoffMarkdown = await generateHandoffMarkdown({
    riskAssessmentId: assess.persisted.id,
    configPath: workspace.configPath,
    manifestPath: workspace.manifestPath,
  });

  // Step 8: generate-charters (manual-exploration + dev-box items only)
  const manualItems = listAllocationItemsByDestination(
    databasePath,
    assess.persisted.id,
    "manual-exploration",
  );
  const devBoxItems = listAllocationItemsByDestination(
    databasePath,
    assess.persisted.id,
    "dev-box",
  );
  const intentContext = findIntentContext(databasePath, prIntake.persisted.id);
  const charters = await runGenerateChartersFromAllocation(
    assess.persisted,
    manualItems,
    devBoxItems,
    mapping.persisted.coverageGapMap,
    config,
    intentContext ?? undefined,
  );

  // Step 9: run-session
  const session = await startSession({
    sessionChartersId: charters.persisted.id,
    charterIndex: 0,
    config,
  });

  const firstFramework =
    charters.persisted.charters[0]?.selectedFrameworks[0] ?? "error-guessing";

  await addSessionObservation({
    sessionId: session.session.id,
    targetedHeuristic: firstFramework,
    action: "Transition task from draft to in_progress as non-assignee",
    expected: "Permission denied error",
    actual: "Permission denied error with clear message",
    outcome: "pass",
    note: "Role guard correctly blocks unauthorized transitions",
    evidencePath: null,
    config,
  });

  await addSessionObservation({
    sessionId: session.session.id,
    targetedHeuristic: firstFramework,
    action: "Transition task from draft to done (skipping open)",
    expected: "Validation error for invalid transition",
    actual: "Task moved to done without error",
    outcome: "fail",
    note: "State machine allows skipping intermediate states",
    evidencePath: null,
    config,
  });

  await completeSession({ sessionId: session.session.id, config });

  // Step 10: triage-findings
  const observations = listObservations(databasePath, session.session.id);
  const failObs = observations.find((o) => o.outcome === "fail");
  const passObs = observations.find((o) => o.outcome === "pass");

  if (!failObs || !passObs) {
    throw new Error("Expected both pass and fail observations");
  }

  await addFinding({
    sessionId: session.session.id,
    observationId: failObs.id,
    type: "defect",
    title: "State machine allows skipping intermediate states",
    description:
      "Task can be moved from draft directly to done without going through open/in_progress.",
    severity: "high",
    recommendedTestLayer: null,
    automationRationale: null,
    config,
  });

  await addFinding({
    sessionId: session.session.id,
    observationId: passObs.id,
    type: "automation-candidate",
    title: "Role-based transition guard is deterministic",
    description:
      "Permission check for status transitions can be covered by unit test.",
    severity: "low",
    recommendedTestLayer: "unit",
    automationRationale:
      "Deterministic permission check with fixed role/assignee inputs, ideal for unit coverage.",
    config,
  });

  await writeTriageHandover({ sessionId: session.session.id, config });

  // Step 11: export-artifacts
  const exportResult = await exportArtifacts({
    prIntakeId: prIntake.persisted.id,
    config,
  });

  return {
    config,
    databasePath,
    prIntake,
    context,
    mapping,
    assess,
    allocate: allocateResult,
    handoffMarkdown,
    charters,
    session,
    exportResult,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("skill-contract E2E workflow", { timeout: 30_000 }, () => {
  const workspaces: string[] = [];

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setup(): Promise<{
    workspace: TestWorkspace;
    result: SkillPipelineResult;
  }> {
    const workspace = await createTestWorkspaceWithSampleApp();
    workspaces.push(workspace.root);
    const result = await runSkillPipeline(workspace);
    return { workspace, result };
  }

  // -----------------------------------------------------------------------
  // SC-1: Setup initialises progress, DB, and current step correctly
  // -----------------------------------------------------------------------
  it("SC-1: setup produces correct initial state before any pipeline step runs", async () => {
    // Dedicated workspace — only setup runs, no full pipeline
    const workspace = await createTestWorkspaceWithSampleApp();
    workspaces.push(workspace.root);

    const setupResult = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    // DB is created
    expect(setupResult.databasePath).toBeTruthy();

    // Progress summary exists and reflects initial state
    const summary = await readProgressSummaryDocument(
      config.paths.progressSummary,
    );
    expect(summary.frontmatter.total_steps).toBe(WORKFLOW_SKILLS.length);
    expect(summary.frontmatter.completed_steps).toBe(1); // only setup

    // All 11 steps are registered; setup is completed, rest is pending
    const snapshots = listStepProgressSnapshots(config.paths.database);
    expect(snapshots).toHaveLength(WORKFLOW_SKILLS.length);

    const setupSnapshot = snapshots.find((s) => s.stepName === "setup");
    expect(setupSnapshot?.status).toBe("completed");

    // current_step should be the first pending step (pr-intake)
    expect(summary.frontmatter.current_step).toBe("pr-intake");

    const pendingSnapshots = snapshots.filter(
      (s) => s.status === "pending" && s.stepName !== "setup",
    );
    expect(pendingSnapshots).toHaveLength(WORKFLOW_SKILLS.length - 1);
  });

  // -----------------------------------------------------------------------
  // SC-2: Step transitions follow workflow definition order
  // -----------------------------------------------------------------------
  it("SC-2: handover files follow workflow step order and reference correct next step", async () => {
    const { result, workspace } = await setup();
    const snapshots = listStepProgressSnapshots(result.databasePath);

    // All 11 workflow steps have snapshots
    expect(snapshots).toHaveLength(WORKFLOW_SKILLS.length);

    // Verify step order matches WORKFLOW_SKILLS definition
    for (let i = 0; i < WORKFLOW_SKILLS.length; i++) {
      const expected = WORKFLOW_SKILLS[i];
      const actual = snapshots[i];
      expect(actual.stepName).toBe(expected.name);
      expect(actual.skillName).toBe(expected.name);
    }

    // Each completed handover file references the correct next step
    for (const snapshot of snapshots) {
      if (snapshot.status !== "completed" || !snapshot.progressPath) {
        continue;
      }

      const filePath = resolve(workspace.root, snapshot.progressPath);
      const doc = await readStepHandoverDocument(filePath);

      const stepIndex = WORKFLOW_SKILLS.findIndex(
        (s) => s.name === snapshot.stepName,
      );
      const expectedNext = WORKFLOW_SKILLS[stepIndex + 1]?.name ?? null;
      expect(doc.frontmatter.next_step).toBe(expectedNext);
    }
  });

  // -----------------------------------------------------------------------
  // SC-3: Handover/progress files serve as skill re-entry material
  // -----------------------------------------------------------------------
  it("SC-3: handover files contain non-empty summary suitable for skill re-entry", async () => {
    const { result, workspace } = await setup();
    const snapshots = listStepProgressSnapshots(result.databasePath);
    const completedSnapshots = snapshots.filter(
      (s) => s.status === "completed" && s.progressPath,
    );

    expect(completedSnapshots.length).toBeGreaterThanOrEqual(
      WORKFLOW_SKILLS.length - 1,
    );

    for (const snapshot of completedSnapshots) {
      // summary is non-empty and contains actionable info
      expect(
        snapshot.summary,
        `${snapshot.stepName} has empty summary`,
      ).toBeTruthy();
      expect(
        snapshot.summary.length,
        `${snapshot.stepName} summary too short to be useful`,
      ).toBeGreaterThan(10);

      // Progress file is readable with valid frontmatter
      if (!snapshot.progressPath) {
        throw new Error(`${snapshot.stepName} has no progressPath`);
      }
      const filePath = resolve(workspace.root, snapshot.progressPath);
      const doc = await readStepHandoverDocument(filePath);
      expect(doc.frontmatter.status).toBe("completed");
      expect(doc.frontmatter.step_name).toBe(snapshot.stepName);
      expect(doc.body.length).toBeGreaterThan(0);
    }
  });

  // -----------------------------------------------------------------------
  // SC-4: Intent context from pr-intake propagates to downstream steps
  // -----------------------------------------------------------------------
  it("SC-4: pr-intake extracts intent context and it persists in DB", async () => {
    const { result } = await setup();
    const intentContext = findIntentContext(
      result.databasePath,
      result.prIntake.persisted.id,
    );

    expect(intentContext).not.toBeNull();
    expect(intentContext?.extractionStatus).not.toBe("empty");

    // Acceptance criteria from the PR description should be extracted
    expect(
      intentContext?.acceptanceCriteria.length,
      "Should extract acceptance criteria from PR description",
    ).toBeGreaterThan(0);

    // Non-goals should be extracted
    expect(
      intentContext?.nonGoals.length,
      "Should extract non-goals from PR description",
    ).toBeGreaterThan(0);

    // Intent context should be available for export-artifacts
    // (verified indirectly: the exploration brief includes intent context)
    const brief = await readFile(
      result.exportResult.artifacts.explorationBrief,
      "utf8",
    );
    expect(brief).toContain("Intent Context");
  });

  // -----------------------------------------------------------------------
  // SC-5: Charters are driven by manual-exploration items
  // -----------------------------------------------------------------------
  it("SC-5: charters are generated and overlap with manual-exploration items", async () => {
    const { result } = await setup();
    const { charters, assess } = result;

    // Charters must exist
    expect(charters.persisted.charters.length).toBeGreaterThan(0);

    // Manual-exploration items exist (some items remain for manual exploration)
    const manualItems = listAllocationItemsByDestination(
      result.databasePath,
      assess.persisted.id,
      "manual-exploration",
    );
    expect(
      manualItems.length,
      "Should have manual-exploration items to drive charters",
    ).toBeGreaterThan(0);

    // Charter scope overlaps with manual-exploration file paths.
    // Note: charter scope comes from exploration themes' targetFiles, which
    // may include files beyond the strict manual-exploration allocation set
    // (themes are filtered by overlap, not intersection).
    const manualFilePaths = new Set(
      manualItems.flatMap((item) => item.changedFilePaths),
    );
    const allCharterScopePaths = new Set(
      charters.persisted.charters.flatMap((c) => c.scope),
    );

    const overlap = [...manualFilePaths].filter((p) =>
      allCharterScopePaths.has(p),
    );
    expect(
      overlap.length,
      "At least one manual-exploration file should appear in charter scope",
    ).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // SC-6: Allocation produces confidence-based items across destinations
  // -----------------------------------------------------------------------
  it("SC-6: allocation items carry confidence and distribute across multiple destinations", async () => {
    const { result } = await setup();
    const { items, destinationCounts } = result.allocate;

    expect(items.length).toBeGreaterThan(0);

    // Items have confidence values
    for (const item of items) {
      expect(item.confidence).toBeGreaterThan(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
    }

    // Multiple destination types should be populated
    const populatedDestinations = Object.entries(destinationCounts).filter(
      ([, count]) => count > 0,
    );
    expect(
      populatedDestinations.length,
      "Should allocate to at least 3 distinct destinations",
    ).toBeGreaterThanOrEqual(3);

    // Verify that items carry hypothesis-relevant metadata
    for (const item of items) {
      expect(item.rationale).toBeTruthy();
      expect(item.sourceSignals).toBeTruthy();
      expect(item.sourceSignals.reasoningSummary).toBeTruthy();
    }
  });

  // -----------------------------------------------------------------------
  // SC-7: Handoff output carries confidence-based hypothesis
  // -----------------------------------------------------------------------
  it("SC-7: handoff markdown contains confidence badges, sections, and hypothesis caveat", async () => {
    const { result } = await setup();
    const { markdown, sections, summary } = result.handoffMarkdown;

    // Markdown is non-empty
    expect(markdown.length).toBeGreaterThan(100);

    // Contains the three handoff sections
    expect(markdown).toContain("Already Covered");
    expect(markdown).toContain("Should Automate");
    expect(markdown).toContain("Manual Exploration Required");

    // Contains confidence badges (🟢/🟡/🔴)
    const hasConfidenceBadge =
      markdown.includes("🟢") ||
      markdown.includes("🟡") ||
      markdown.includes("🔴");
    expect(
      hasConfidenceBadge,
      "Handoff markdown should include confidence badges",
    ).toBe(true);

    // Contains the hypothesis caveat note
    expect(markdown).toContain("heuristic recommendations");
    expect(markdown).toContain("Confidence levels");

    // Sections are populated across multiple categories
    const populatedSections = [
      sections.alreadyCovered.length > 0,
      sections.shouldAutomate.length > 0,
      sections.manualExploration.length > 0,
    ].filter(Boolean).length;
    expect(
      populatedSections,
      "Should populate at least 2 handoff sections",
    ).toBeGreaterThanOrEqual(2);

    // Summary counts are consistent
    expect(summary.totalItems).toBeGreaterThan(0);
    expect(
      summary.manualCount + summary.automateCount + summary.coveredCount,
    ).toBe(summary.totalItems);

    // References the sample app PR
    expect(markdown).toContain("#55");
  });

  // -----------------------------------------------------------------------
  // SC-8: Export artifacts include guarantee-oriented layer summary
  // -----------------------------------------------------------------------
  it("SC-8: exploration brief contains guarantee-oriented layer summary", async () => {
    const { result } = await setup();
    const brief = await readFile(
      result.exportResult.artifacts.explorationBrief,
      "utf8",
    );

    expect(brief).toContain("Guarantee-Oriented Layer Summary");

    // Layer summary should have at least one guarantee bucket with content
    // (unit, integration, UI/E2E, or manual-exploration)
    const hasBucket =
      brief.includes("単体テストで保証したいこと") ||
      brief.includes("統合テスト") ||
      brief.includes("UI / E2E テスト") ||
      brief.includes("手動探索で見ること");
    expect(hasBucket, "Should include at least one guarantee bucket").toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // SC-9: Export artifacts include heuristic feedback report
  // -----------------------------------------------------------------------
  it("SC-9: heuristic feedback report is generated with findings correlation", async () => {
    const { result } = await setup();
    const report = await readFile(
      result.exportResult.artifacts.heuristicFeedbackReport,
      "utf8",
    );

    expect(report).toContain("Heuristic Feedback Report");
    expect(report).toContain("Total findings");
    expect(report).toContain("Total allocation items");

    // Report should correlate findings with allocation destinations
    expect(report).toContain("Findings by Allocation Destination");
  });

  // -----------------------------------------------------------------------
  // SC-10: All 6 artifact files are generated
  // -----------------------------------------------------------------------
  it("SC-10: export-artifacts produces all 6 artifact files", async () => {
    const { result } = await setup();
    const { artifacts } = result.exportResult;

    const artifactPaths = [
      artifacts.explorationBrief,
      artifacts.coverageGapMap,
      artifacts.sessionCharters,
      artifacts.findingsReport,
      artifacts.automationCandidateReport,
      artifacts.heuristicFeedbackReport,
    ];

    // All files exist and have non-trivial content
    const contents = await Promise.all(
      artifactPaths.map((path) => readFile(path, "utf8")),
    );

    for (let i = 0; i < artifactPaths.length; i++) {
      expect(
        contents[i].length,
        `Artifact at ${artifactPaths[i]} is empty`,
      ).toBeGreaterThan(50);
    }
  });

  // -----------------------------------------------------------------------
  // SC-11: PR data and findings flow through to exported artifacts
  // -----------------------------------------------------------------------
  it("SC-11: exported artifacts reference PR data, session findings, and intent context", async () => {
    const { result } = await setup();
    const { artifacts } = result.exportResult;

    const [brief, findingsReport, automationReport] = await Promise.all([
      readFile(artifacts.explorationBrief, "utf8"),
      readFile(artifacts.findingsReport, "utf8"),
      readFile(artifacts.automationCandidateReport, "utf8"),
    ]);

    // Brief references the sample app PR
    expect(brief).toContain("#55");
    expect(brief).toContain("task-board");

    // Findings report includes the defect from the session
    expect(findingsReport).toContain("defect");
    expect(findingsReport).toContain(
      "State machine allows skipping intermediate states",
    );

    // Automation candidate report includes the candidate
    expect(automationReport).toContain("unit");
    expect(automationReport).toContain(
      "Role-based transition guard is deterministic",
    );
  });
});
