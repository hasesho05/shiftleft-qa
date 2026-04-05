/**
 * Live E2E test: canonical PR against a real GitHub sample app repository.
 *
 * Unlike the local-fixture E2E tests (tests/e2e/), this test:
 *   - Clones a real GitHub repository (hasesho05/shiftleft-qa-sample-app)
 *   - Fetches real PR metadata via `gh pr view`
 *   - Runs the full pipeline with real changed files and intent context
 *   - Validates output invariants (not exact text)
 *
 * Prerequisites:
 *   - `gh auth login` with access to the sample repository
 *   - Network connectivity to GitHub
 *
 * Run with: bun run test:live-e2e
 * NOT included in `bun run check` or `bun run test`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
import { runPrIntake } from "../../src/exploratory-testing/tools/pr-intake";
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
import { cleanupTestWorkspace } from "../helpers/workspace";

import {
  CANONICAL_PR_NUMBER,
  CANONICAL_REPO,
  CANONICAL_REPO_URL,
  EXPECTED_ARTIFACT_COUNT,
  MIN_CATEGORIES,
  MIN_CHANGED_FILES,
  MIN_DISTINCT_DESTINATIONS,
  MIN_FRAMEWORKS,
  MIN_VIEWPOINTS_WITH_SEEDS,
} from "./config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LivePipelineResult = {
  readonly workspaceRoot: string;
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
// Plugin manifest (same as tests/helpers/workspace.ts)
// ---------------------------------------------------------------------------

const PLUGIN_MANIFEST = {
  name: "shiftleft-qa",
  version: "0.1.0",
  description:
    "Shift-left test allocation と GitHub QA handoff を支援する Claude Code Plugin。",
  runtime: {
    packageManager: "bun",
    entry: "bun run dev",
  },
  state: {
    config: "config.json",
    database: "exploratory-testing.db",
    progressDirectory: ".exploratory-testing/progress",
    artifactsDirectory: "output",
  },
  skills: [
    {
      name: "setup",
      path: "skills/setup/SKILL.md",
      description: "Initialize config, workspace state, and progress tracking.",
    },
    {
      name: "pr-intake",
      path: "skills/pr-intake/SKILL.md",
      description: "Ingest PR or MR metadata and changed files.",
    },
    {
      name: "discover-context",
      path: "skills/discover-context/SKILL.md",
      description: "Analyze code and diff context before exploration.",
    },
    {
      name: "map-tests",
      path: "skills/map-tests/SKILL.md",
      description: "Map related automated tests and summarize coverage.",
    },
    {
      name: "assess-gaps",
      path: "skills/assess-gaps/SKILL.md",
      description: "Identify coverage gaps and select exploratory heuristics.",
    },
    {
      name: "allocate",
      path: "skills/allocate/SKILL.md",
      description: "Allocate coverage gaps to testing destinations.",
    },
    {
      name: "handoff",
      path: "skills/handoff/SKILL.md",
      description: "Create QA handoff issue on GitHub.",
    },
    {
      name: "generate-charters",
      path: "skills/generate-charters/SKILL.md",
      description: "Generate short, executable exploratory session charters.",
    },
    {
      name: "run-session",
      path: "skills/run-session/SKILL.md",
      description: "Record exploratory session observations and evidence.",
    },
    {
      name: "triage-findings",
      path: "skills/triage-findings/SKILL.md",
      description:
        "Classify findings into defects, spec gaps, and automation candidates.",
    },
    {
      name: "export-artifacts",
      path: "skills/export-artifacts/SKILL.md",
      description: "Export the brief, gap map, charters, and findings reports.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isGhAuthenticated(): Promise<boolean> {
  try {
    await execa("gh", ["auth", "status"], { reject: true });
    return true;
  } catch {
    return false;
  }
}

async function cloneAndPrepareWorkspace(): Promise<{
  root: string;
  configPath: string;
  manifestPath: string;
}> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  const root = await mkdtemp(join(tmpdir(), "shiftleft-qa-live-e2e-"));

  // Clone the sample repository (depth=1 for speed — we only need the
  // file tree on disk so that discover-context can find test assets)
  await execa("git", ["clone", "--depth", "1", CANONICAL_REPO_URL, root], {
    timeout: 60_000,
    reject: true,
  });

  // Write plugin manifest and empty config into the cloned repo
  const pluginDirectory = join(root, ".claude-plugin");
  const manifestPath = join(pluginDirectory, "plugin.json");
  const configPath = join(root, "config.json");

  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(PLUGIN_MANIFEST, null, 2)}\n`,
    "utf8",
  );
  // Empty config — ensurePluginConfig will populate defaults
  await writeFile(configPath, "{}", "utf8");

  return { root, configPath, manifestPath };
}

// ---------------------------------------------------------------------------
// Pipeline orchestration
// ---------------------------------------------------------------------------

async function runLivePipeline(workspace: {
  root: string;
  configPath: string;
  manifestPath: string;
}): Promise<LivePipelineResult> {
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

  // Step 2: pr-intake — REAL gh pr view call
  const prIntake = await runPrIntake({
    prNumber: CANONICAL_PR_NUMBER,
    configPath: workspace.configPath,
    manifestPath: workspace.manifestPath,
  });

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

  // Step 7: handoff — markdown only, no GitHub write
  const handoffMarkdown = await generateHandoffMarkdown({
    riskAssessmentId: assess.persisted.id,
    configPath: workspace.configPath,
    manifestPath: workspace.manifestPath,
  });

  // Step 8: generate-charters
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

  // Step 9: run-session (synthetic observations, same pattern as skill-contract.test.ts)
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
    action: "Submit task for approval as viewer role",
    expected: "Permission denied — only lead/admin can approve",
    actual: "Permission denied with clear error message",
    outcome: "pass",
    note: "Role guard correctly blocks unauthorized approval",
    evidencePath: null,
    config,
  });

  await addSessionObservation({
    sessionId: session.session.id,
    targetedHeuristic: firstFramework,
    action: "Reject task without providing a reason",
    expected: "Validation error requiring rejection reason",
    actual: "Task rejected without reason",
    outcome: "fail",
    note: "Rejection reason validation missing on backend",
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
    title: "Rejection reason validation missing",
    description:
      "Task can be rejected without providing a reason, violating acceptance criteria.",
    severity: "high",
    recommendedTestLayer: null,
    automationRationale: null,
    config,
  });

  await addFinding({
    sessionId: session.session.id,
    observationId: passObs.id,
    type: "automation-candidate",
    title: "Role-based approval guard is deterministic",
    description: "Permission check for approval can be covered by unit test.",
    severity: "low",
    recommendedTestLayer: "unit",
    automationRationale:
      "Deterministic role check with fixed inputs, ideal for unit coverage.",
    config,
  });

  await writeTriageHandover({ sessionId: session.session.id, config });

  // Step 11: export-artifacts
  const exportResult = await exportArtifacts({
    prIntakeId: prIntake.persisted.id,
    config,
  });

  return {
    workspaceRoot: workspace.root,
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
// Top-level auth check — resolved before describe so skipIf works
// ---------------------------------------------------------------------------

const ghAuthAvailable = await isGhAuthenticated();

// ---------------------------------------------------------------------------
// Test suite — skipped entirely when gh auth is not available
// ---------------------------------------------------------------------------

describe.skipIf(!ghAuthAvailable)(
  "live E2E: canonical PR",
  { timeout: 120_000 },
  () => {
    let workspaceRoot: string | undefined;
    let result: LivePipelineResult;

    beforeAll(async () => {
      const workspace = await cloneAndPrepareWorkspace();
      workspaceRoot = workspace.root;
      result = await runLivePipeline(workspace);
    }, 120_000);

    afterAll(async () => {
      if (workspaceRoot) {
        await cleanupTestWorkspace(workspaceRoot);
      }
    });

    // -----------------------------------------------------------------------
    // LIVE-1: PR intake captures real metadata from gh CLI
    // -----------------------------------------------------------------------
    it("LIVE-1: pr-intake captures real metadata and intent context from gh CLI", () => {
      const { prIntake } = result;

      // Real repository and PR number
      expect(prIntake.persisted.repository).toBe(CANONICAL_REPO);
      expect(prIntake.persisted.prNumber).toBe(CANONICAL_PR_NUMBER);

      // Changed files from real PR
      expect(prIntake.persisted.changedFiles.length).toBeGreaterThanOrEqual(
        MIN_CHANGED_FILES,
      );

      // Intent context was parsed from real PR description
      expect(prIntake.intentContext).not.toBeNull();
      expect(prIntake.intentContext?.extractionStatus).not.toBe("empty");

      // Acceptance criteria extracted from the structured PR description
      expect(
        prIntake.intentContext?.acceptanceCriteria.length,
        "Should extract acceptance criteria from canonical PR description",
      ).toBeGreaterThan(0);

      // Non-goals extracted
      expect(
        prIntake.intentContext?.nonGoals.length,
        "Should extract non-goals from canonical PR description",
      ).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // LIVE-2: discover-context classifies files across multiple categories
    // -----------------------------------------------------------------------
    it("LIVE-2: discover-context classifies files with diverse categories and viewpoint seeds", () => {
      const { context } = result;

      expect(context.persisted.fileAnalyses.length).toBeGreaterThanOrEqual(
        MIN_CHANGED_FILES,
      );

      // Collect unique categories across all files
      const allCategories = new Set(
        context.persisted.fileAnalyses.flatMap((f) => f.categories),
      );
      expect(
        allCategories.size,
        `Expected >= ${MIN_CATEGORIES} categories, got: ${[...allCategories].join(", ")}`,
      ).toBeGreaterThanOrEqual(MIN_CATEGORIES);

      // Viewpoint seeds should be populated
      const viewpointsWithSeeds = context.persisted.viewpointSeeds.filter(
        (v) => v.seeds.length > 0,
      );
      expect(viewpointsWithSeeds.length).toBeGreaterThanOrEqual(
        MIN_VIEWPOINTS_WITH_SEEDS,
      );
    });

    // -----------------------------------------------------------------------
    // LIVE-3: map-tests produces coverage gap map
    // -----------------------------------------------------------------------
    it("LIVE-3: map-tests produces coverage gap map with partial and gap entries", () => {
      const { mapping } = result;

      expect(mapping.persisted.coverageGapMap.length).toBeGreaterThan(0);

      // The sample repo has some tests, so we expect at least partial coverage
      const statuses = mapping.persisted.coverageGapMap.map((e) => e.status);
      const hasPartialOrCovered =
        statuses.includes("partial") || statuses.includes("covered");
      expect(
        hasPartialOrCovered,
        "Sample repo has tests; should produce at least partial coverage",
      ).toBe(true);

      // Should also have some uncovered aspects
      const hasUncovered = statuses.includes("uncovered");
      expect(
        hasUncovered,
        "Not all aspects should be covered — some uncovered entries expected",
      ).toBe(true);
    });

    // -----------------------------------------------------------------------
    // LIVE-4: assess-gaps selects diverse frameworks
    // -----------------------------------------------------------------------
    it("LIVE-4: assess-gaps selects diverse frameworks and generates exploration themes", () => {
      const { assess } = result;

      expect(assess.persisted.frameworkSelections.length).toBeGreaterThan(0);

      // Distinct frameworks
      const uniqueFrameworks = new Set(
        assess.persisted.frameworkSelections.map((s) => s.framework),
      );
      expect(uniqueFrameworks.size).toBeGreaterThanOrEqual(MIN_FRAMEWORKS);

      // Exploration themes generated
      expect(assess.persisted.explorationThemes.length).toBeGreaterThan(0);

      // Each theme has required fields
      for (const theme of assess.persisted.explorationThemes) {
        expect(theme.title).toBeTruthy();
        expect(theme.targetFiles.length).toBeGreaterThan(0);
      }
    });

    // -----------------------------------------------------------------------
    // LIVE-5: allocate distributes items across multiple destinations
    // -----------------------------------------------------------------------
    it("LIVE-5: allocation items carry confidence and distribute across destinations", () => {
      const { items, destinationCounts } = result.allocate;

      expect(items.length).toBeGreaterThan(0);

      // All items have valid confidence
      for (const item of items) {
        expect(item.confidence).toBeGreaterThan(0);
        expect(item.confidence).toBeLessThanOrEqual(1);
      }

      // Distributed across multiple destinations
      const populatedDestinations = Object.entries(destinationCounts).filter(
        ([, count]) => count > 0,
      );
      expect(populatedDestinations.length).toBeGreaterThanOrEqual(
        MIN_DISTINCT_DESTINATIONS,
      );
    });

    // -----------------------------------------------------------------------
    // LIVE-6: handoff markdown contains real intent context and layer headings
    // -----------------------------------------------------------------------
    it("LIVE-6: handoff markdown references canonical PR and contains intent context", () => {
      const { markdown } = result.handoffMarkdown;

      expect(markdown.length).toBeGreaterThan(100);

      // References the canonical PR
      expect(markdown).toContain(`#${CANONICAL_PR_NUMBER}`);

      // Contains the three handoff sections
      expect(markdown).toContain("Already Covered");
      expect(markdown).toContain("Should Automate");
      expect(markdown).toContain("Manual Exploration Required");

      // Contains confidence badges
      const hasConfidenceBadge =
        markdown.includes("🟢") ||
        markdown.includes("🟡") ||
        markdown.includes("🔴");
      expect(hasConfidenceBadge, "Should include confidence badges").toBe(true);
    });

    // -----------------------------------------------------------------------
    // LIVE-7: exported artifacts are complete and reference real PR data
    // -----------------------------------------------------------------------
    it("LIVE-7: export-artifacts produces all artifact files with real PR references", async () => {
      const { artifacts } = result.exportResult;

      const artifactPaths = [
        artifacts.explorationBrief,
        artifacts.coverageGapMap,
        artifacts.sessionCharters,
        artifacts.findingsReport,
        artifacts.automationCandidateReport,
        artifacts.heuristicFeedbackReport,
      ];

      expect(artifactPaths).toHaveLength(EXPECTED_ARTIFACT_COUNT);

      // All files exist and have content
      const contents = await Promise.all(
        artifactPaths.map((path) => readFile(path, "utf8")),
      );

      for (let i = 0; i < artifactPaths.length; i++) {
        expect(
          contents[i].length,
          `Artifact at ${artifactPaths[i]} is empty`,
        ).toBeGreaterThan(50);
      }

      // Exploration brief references the real repo
      const brief = contents[0];
      expect(brief).toContain(`#${CANONICAL_PR_NUMBER}`);
      expect(brief).toContain("Intent Context");
      expect(brief).toContain("Guarantee-Oriented Layer Summary");

      // Heuristic feedback report exists
      const feedbackReport = contents[5];
      expect(feedbackReport).toContain("Heuristic Feedback Report");
    });

    // -----------------------------------------------------------------------
    // LIVE-8: progress snapshots show all workflow steps
    // -----------------------------------------------------------------------
    it("LIVE-8: progress snapshots cover all 11 workflow steps", () => {
      const snapshots = listStepProgressSnapshots(result.databasePath);
      expect(snapshots).toHaveLength(WORKFLOW_SKILLS.length);

      // All steps have snapshots in workflow order
      for (let i = 0; i < WORKFLOW_SKILLS.length; i++) {
        expect(snapshots[i].stepName).toBe(WORKFLOW_SKILLS[i].name);
      }

      // Most steps should be completed (handoff may be skipped)
      const completedSteps = snapshots.filter((s) => s.status === "completed");
      expect(completedSteps.length).toBeGreaterThanOrEqual(
        WORKFLOW_SKILLS.length - 1,
      );
    });

    // -----------------------------------------------------------------------
    // LIVE-9: DB records form a complete chain
    // -----------------------------------------------------------------------
    it("LIVE-9: DB records form a complete chain from pr-intake to findings", () => {
      // PR intake persisted
      expect(result.prIntake.persisted.id).toBeGreaterThan(0);

      // Intent context linked to PR intake
      const intentContext = findIntentContext(
        result.databasePath,
        result.prIntake.persisted.id,
      );
      expect(intentContext).not.toBeNull();

      // Change analysis linked to PR intake
      expect(result.context.persisted.id).toBeGreaterThan(0);
      expect(result.context.persisted.prIntakeId).toBe(
        result.prIntake.persisted.id,
      );

      // Test mapping linked to change analysis
      expect(result.mapping.persisted.id).toBeGreaterThan(0);

      // Risk assessment linked to test mapping
      expect(result.assess.persisted.id).toBeGreaterThan(0);

      // Allocation items exist
      expect(result.allocate.items.length).toBeGreaterThan(0);

      // Session charters exist
      expect(result.charters.persisted.id).toBeGreaterThan(0);
      expect(result.charters.persisted.charters.length).toBeGreaterThan(0);

      // Session with observations
      expect(result.session.session.id).toBeGreaterThan(0);
      const observations = listObservations(
        result.databasePath,
        result.session.session.id,
      );
      expect(observations.length).toBe(2);
    });
  },
);
