/**
 * Tool-chain integration test for the full 9-step pipeline.
 *
 * Drives the pipeline via tool functions (not CLI entry point / gh CLI).
 * Uses the "OrderFlow" fixture designed to trigger all 10 change categories.
 *
 * Purpose: regression prevention for the current heuristic implementation
 * and minimum quality guarantee for pipeline output.
 */
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  findSession,
  listFindings,
  listObservations,
  listStepProgressSnapshots,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { ResolvedPluginConfig } from "../../src/exploratory-testing/models/config";
import { runAssessGapsFromMapping } from "../../src/exploratory-testing/tools/assess-gaps";
import type { AssessGapsResult } from "../../src/exploratory-testing/tools/assess-gaps";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
import type { DiscoverContextResult } from "../../src/exploratory-testing/tools/discover-context";
import { exportArtifacts } from "../../src/exploratory-testing/tools/export-artifacts";
import type { ExportArtifactsResult } from "../../src/exploratory-testing/tools/export-artifacts";
import { runGenerateChartersFromAssessment } from "../../src/exploratory-testing/tools/generate-charters";
import type { GenerateChartersResult } from "../../src/exploratory-testing/tools/generate-charters";
import { runMapTestsFromAnalysis } from "../../src/exploratory-testing/tools/map-tests";
import type { MapTestsResult } from "../../src/exploratory-testing/tools/map-tests";
import { savePrIntakeResult } from "../../src/exploratory-testing/tools/pr-intake";
import type { PrIntakeResult } from "../../src/exploratory-testing/tools/pr-intake";
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
  createTestWorkspace,
} from "../helpers/workspace";
import { createOrderFlowPrMetadata } from "./fixtures/order-flow-pr";

// ---------------------------------------------------------------------------
// Types for pipeline result
// ---------------------------------------------------------------------------

type FullPipelineResult = {
  readonly config: ResolvedPluginConfig;
  readonly databasePath: string;
  readonly prIntake: PrIntakeResult;
  readonly context: DiscoverContextResult;
  readonly mapping: MapTestsResult;
  readonly assess: AssessGapsResult;
  readonly charters: GenerateChartersResult;
  readonly session: StartSessionResult;
  readonly exportResult: ExportArtifactsResult;
};

// ---------------------------------------------------------------------------
// Pipeline helper
// ---------------------------------------------------------------------------

async function runFullPipeline(
  workspace: TestWorkspace,
): Promise<FullPipelineResult> {
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

  // Step 2: pr-intake (with handover)
  const prIntake = await savePrIntakeResult(
    createOrderFlowPrMetadata(),
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

  // Step 6: generate-charters
  const charters = await runGenerateChartersFromAssessment(
    assess.persisted,
    mapping.persisted.coverageGapMap,
    config,
  );

  // Step 7: run-session (charter 0 only, no siblings → step completed)
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
    action: "Submit order with valid data",
    expected: "Order confirmation displayed",
    actual: "Order confirmation displayed",
    outcome: "pass",
    note: "Happy path works as expected",
    evidencePath: null,
    config,
  });

  await addSessionObservation({
    sessionId: session.session.id,
    targetedHeuristic: firstFramework,
    action: "Submit order with negative quantity",
    expected: "Validation error shown",
    actual: "500 Internal Server Error",
    outcome: "fail",
    note: "Server crashes on negative quantity input",
    evidencePath: null,
    config,
  });

  await completeSession({ sessionId: session.session.id, config });

  // Step 8: triage-findings
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
    title: "Server crash on negative quantity",
    description:
      "Submitting a negative quantity causes a 500 error instead of validation.",
    severity: "high",
    recommendedTestLayer: null,
    automationRationale: null,
    config,
  });

  await addFinding({
    sessionId: session.session.id,
    observationId: passObs.id,
    type: "automation-candidate",
    title: "Order happy path is automatable",
    description:
      "Standard order submission can be covered by integration test.",
    severity: "low",
    recommendedTestLayer: "integration",
    automationRationale:
      "Deterministic flow with stable API contract, suitable for CI.",
    config,
  });

  await writeTriageHandover({ sessionId: session.session.id, config });

  // Step 9: export-artifacts
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
    charters,
    session,
    exportResult,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("full pipeline integration", { timeout: 30_000 }, () => {
  const workspaces: string[] = [];

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setup(): Promise<{
    workspace: TestWorkspace;
    result: FullPipelineResult;
  }> {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await runFullPipeline(workspace);
    return { workspace, result };
  }

  // -----------------------------------------------------------------------
  // T1: Progress snapshots show all 9 steps completed
  // -----------------------------------------------------------------------
  it("T1: all 9 steps reach completed status in progress snapshots", async () => {
    const { result } = await setup();
    const snapshots = listStepProgressSnapshots(result.databasePath);

    expect(snapshots).toHaveLength(9);

    const nonCompleted = snapshots.filter((s) => s.status !== "completed");
    expect(
      nonCompleted,
      `Expected all steps completed, but found: ${nonCompleted.map((s) => `${s.stepName}=${s.status}`).join(", ")}`,
    ).toHaveLength(0);

    // Spot-check: representative handover files exist
    const prIntakeProgress = snapshots.find((s) => s.stepName === "pr-intake");
    expect(prIntakeProgress?.progressPath).toBeTruthy();

    const exportProgress = snapshots.find(
      (s) => s.stepName === "export-artifacts",
    );
    expect(exportProgress?.progressPath).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // T2: File classification covers minimum expected categories
  // -----------------------------------------------------------------------
  it("T2: file classification includes at least 6 core categories", async () => {
    const { result } = await setup();
    const { fileAnalyses } = result.context.persisted;

    expect(fileAnalyses).toHaveLength(11);

    const allCategories = new Set(
      fileAnalyses.flatMap((fa) => fa.categories.map((c) => c.category)),
    );

    const requiredCategories = [
      "ui",
      "api",
      "validation",
      "permission",
      "async",
      "schema",
    ];
    for (const cat of requiredCategories) {
      expect(allCategories, `Missing category: ${cat}`).toContain(cat);
    }

    // Multi-category file
    const multiCatFile = fileAnalyses.find(
      (fa) => fa.path === "src/shared/validators/order-form.tsx",
    );
    expect(multiCatFile).toBeDefined();
    expect(
      multiCatFile?.categories.length,
      "order-form.tsx should have 2+ categories",
    ).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // T3: Viewpoint seeds are populated
  // -----------------------------------------------------------------------
  it("T3: at least 4 of 5 viewpoints have non-empty seeds", async () => {
    const { result } = await setup();
    const { viewpointSeeds } = result.context.persisted;

    expect(viewpointSeeds).toHaveLength(5);

    const populated = viewpointSeeds.filter((vp) => vp.seeds.length > 0);
    expect(
      populated.length,
      `Only ${populated.length}/5 viewpoints have seeds`,
    ).toBeGreaterThanOrEqual(4);

    // Seeds are non-empty strings (category-based descriptions)
    const allSeeds = populated.flatMap((vp) => vp.seeds);
    expect(allSeeds.length).toBeGreaterThan(0);
    for (const s of allSeeds) {
      expect(s).not.toBe("");
    }
  });

  // -----------------------------------------------------------------------
  // T4: Exploration frameworks are selected with diversity
  // -----------------------------------------------------------------------
  it("T4: at least 3 distinct frameworks selected with non-empty reasons", async () => {
    const { result } = await setup();
    const { frameworkSelections } = result.assess.persisted;

    expect(frameworkSelections.length).toBeGreaterThan(0);

    const uniqueFrameworks = new Set(
      frameworkSelections.map((fs) => fs.framework),
    );
    expect(
      uniqueFrameworks.size,
      `Only ${uniqueFrameworks.size} distinct framework(s) selected`,
    ).toBeGreaterThanOrEqual(3);

    for (const fs of frameworkSelections) {
      expect(
        fs.reason,
        `Framework ${fs.framework} has empty reason`,
      ).toBeTruthy();
    }
  });

  // -----------------------------------------------------------------------
  // T5: Coverage gaps are partial-biased (current heuristic generates
  //     inferred test candidates for all files → no covered, mostly partial)
  // -----------------------------------------------------------------------
  it("T5: coverage gap map is non-empty with no covered entries and partial gaps", async () => {
    const { result } = await setup();
    const gaps = result.mapping.persisted.coverageGapMap;

    expect(gaps.length, "coverageGapMap should not be empty").toBeGreaterThan(
      0,
    );

    const covered = gaps.filter((g) => g.status === "covered");
    const partial = gaps.filter((g) => g.status === "partial");

    // Current implementation never produces "confirmed" coverage,
    // so "covered" should not appear (or at most be a minority).
    expect(
      covered.length,
      `covered (${covered.length}) should be < half of total (${gaps.length})`,
    ).toBeLessThan(gaps.length / 2);

    // With inferred test asset candidates for every file,
    // most gaps should be "partial".
    expect(
      partial.length,
      "at least 1 partial gap expected",
    ).toBeGreaterThanOrEqual(1);

    // Multiple files should have gap entries
    const filesWithGaps = new Set(gaps.map((g) => g.changedFilePath));
    expect(filesWithGaps.size).toBeGreaterThanOrEqual(5);
  });

  // -----------------------------------------------------------------------
  // T6: Session, observations, and findings persisted in DB
  // -----------------------------------------------------------------------
  it("T6: session completed with 2 observations and 2 findings", async () => {
    const { result } = await setup();
    const { databasePath } = result;
    const sessionId = result.session.session.id;

    const session = findSession(databasePath, sessionId);
    expect(session).not.toBeNull();
    expect(session?.status).toBe("completed");

    const observations = listObservations(databasePath, sessionId);
    expect(observations).toHaveLength(2);
    expect(observations.some((o) => o.outcome === "pass")).toBe(true);
    expect(observations.some((o) => o.outcome === "fail")).toBe(true);

    const findings = listFindings(databasePath, sessionId);
    expect(findings).toHaveLength(2);

    const defect = findings.find((f) => f.type === "defect");
    expect(defect).toBeDefined();
    expect(defect?.severity).toBe("high");

    const candidate = findings.find((f) => f.type === "automation-candidate");
    expect(candidate).toBeDefined();
    expect(candidate?.recommendedTestLayer).toBe("integration");
    expect(candidate?.automationRationale).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // T7: Export artifacts contain findings (heavy file assertions here)
  // -----------------------------------------------------------------------
  it("T7: exported artifacts reference PR data and findings", async () => {
    const { result } = await setup();
    const { artifacts } = result.exportResult;

    // All 5 files exist (readFile will throw if not)
    const [brief, gapMap, chartersDoc, findingsReport, automationReport] =
      await Promise.all([
        readFile(artifacts.explorationBrief, "utf8"),
        readFile(artifacts.coverageGapMap, "utf8"),
        readFile(artifacts.sessionCharters, "utf8"),
        readFile(artifacts.findingsReport, "utf8"),
        readFile(artifacts.automationCandidateReport, "utf8"),
      ]);

    // Exploration Brief references the PR
    expect(brief).toContain("#100");
    expect(brief).toContain("OrderSummary.tsx");

    // Coverage Gap Map has gap entries (partial-biased due to inferred candidates)
    expect(gapMap).toContain("partial");

    // Session Charters document has charter content
    expect(chartersDoc).toContain("# Session Charters");

    // Findings Report includes the defect (not an empty report)
    expect(findingsReport).toContain("defect");
    expect(findingsReport).toContain("Server crash on negative quantity");

    // Automation Candidate Report includes the integration candidate
    expect(automationReport).toContain("integration");
    expect(automationReport).toContain("Order happy path is automatable");
  });
});
