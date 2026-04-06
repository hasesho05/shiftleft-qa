/**
 * CLI-driven E2E test: skill-first workflow via CLI commands.
 *
 * Unlike canonical-pr.test.ts (which calls tool functions directly), this test
 * drives the entire workflow through `bun run <cli> <command>` — the same
 * interface that SKILL.md instructs an agent to use.
 *
 * This validates:
 *   - CLI layer correctness (JSON envelope, argument parsing)
 *   - Record ID threading between steps (prIntakeId, riskAssessmentId, etc.)
 *   - SKILL.md-described commands produce usable downstream state
 *   - Progress files and artifacts generated via CLI are complete
 *
 * Prerequisites:
 *   - `gh auth login` with access to the sample repository
 *   - Network connectivity to GitHub
 *
 * Run with: bun run test:live-e2e
 * NOT included in `bun run check` or `bun run test`.
 */
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CANONICAL_PR_NUMBER,
  CANONICAL_REPO,
  CANONICAL_REPO_URL,
  EXPECTED_ARTIFACT_COUNT,
  MIN_CATEGORIES,
  MIN_CHANGED_FILES,
  MIN_DISTINCT_DESTINATIONS,
  MIN_FRAMEWORKS,
} from "./config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute path to CLI entry point — used as cwd-independent invocation. */
const CLI_ENTRY_PATH = resolve(
  import.meta.dirname,
  "../../src/exploratory-testing/cli/index.ts",
);

const PR_ARGS = [
  "--pr",
  String(CANONICAL_PR_NUMBER),
  "--provider",
  "github",
  "--repository",
  CANONICAL_REPO,
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CliStepResult = {
  readonly name: string;
  readonly data: Record<string, unknown>;
};

type CliPipelineResults = {
  readonly workspaceRoot: string;
  readonly steps: readonly CliStepResult[];
  readonly setup: Record<string, unknown>;
  readonly prIntake: Record<string, unknown>;
  readonly discoverContext: Record<string, unknown>;
  readonly mapTests: Record<string, unknown>;
  readonly assessGaps: Record<string, unknown>;
  readonly allocate: Record<string, unknown>;
  readonly handoffGenerate: Record<string, unknown>;
  readonly generateCharters: Record<string, unknown>;
  readonly sessionStart: Record<string, unknown>;
  readonly observe1: Record<string, unknown>;
  readonly observe2: Record<string, unknown>;
  readonly sessionComplete: Record<string, unknown>;
  readonly finding1: Record<string, unknown>;
  readonly finding2: Record<string, unknown>;
  readonly findingHandover: Record<string, unknown>;
  readonly exportArtifacts: Record<string, unknown>;
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

/**
 * Run a CLI command and parse the JSON envelope.
 * Throws if the envelope status is not "ok".
 */
async function runCli(
  args: readonly string[],
  cwd: string,
): Promise<Record<string, unknown>> {
  const result = await execa("bun", ["run", CLI_ENTRY_PATH, ...args], {
    cwd,
    timeout: 60_000,
    reject: true,
  });

  // stdout may contain pretty-printed JSON (JSON.stringify with indent=2).
  // Extract the JSON envelope by finding the first '{' and parsing from there.
  const stdout = result.stdout.trim();
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(
      `No JSON in CLI output for [${args.join(" ")}]. stdout: "${stdout.slice(0, 200)}" stderr: "${result.stderr.slice(0, 300)}"`,
    );
  }
  const envelope = JSON.parse(stdout.slice(jsonStart)) as {
    status: string;
    data?: Record<string, unknown>;
    message?: string;
  };

  if (envelope.status !== "ok") {
    throw new Error(
      `CLI command failed: ${args.join(" ")} — ${envelope.message ?? JSON.stringify(envelope)}`,
    );
  }

  return envelope.data ?? {};
}

async function cloneAndPrepareWorkspace(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const root = await mkdtemp(join(tmpdir(), "shiftleft-qa-cli-e2e-"));

  await execa("git", ["clone", "--depth", "1", CANONICAL_REPO_URL, root], {
    timeout: 60_000,
    reject: true,
  });

  // Write plugin manifest
  const pluginDir = join(root, ".claude-plugin");
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, "plugin.json"),
    JSON.stringify(
      {
        name: "shiftleft-qa",
        version: "0.1.0",
        description:
          "Shift-left test allocation と GitHub QA handoff を支援する Claude Code Plugin。",
        runtime: { packageManager: "bun", entry: "bun run dev" },
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
            description:
              "Initialize config, workspace state, and progress tracking.",
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
            description:
              "Identify coverage gaps and select exploratory heuristics.",
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
            description:
              "Generate short, executable exploratory session charters.",
          },
          {
            name: "run-session",
            path: "skills/run-session/SKILL.md",
            description:
              "Record exploratory session observations and evidence.",
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
            description:
              "Export the brief, gap map, charters, and findings reports.",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(join(root, "config.json"), "{}", "utf8");

  return root;
}

// ---------------------------------------------------------------------------
// Pipeline orchestration via CLI
// ---------------------------------------------------------------------------

async function runCliPipeline(
  workspaceRoot: string,
): Promise<CliPipelineResults> {
  const steps: CliStepResult[] = [];

  function record(name: string, data: Record<string, unknown>): void {
    steps.push({ name, data });
  }

  // Step 1: setup
  const setup = await runCli(["setup"], workspaceRoot);
  record("setup", setup);

  // Step 2: pr-intake
  const prIntake = await runCli(
    ["pr-intake", ...PR_ARGS.slice(0, 2)],
    workspaceRoot,
  );
  record("pr-intake", prIntake);

  // Step 3: discover-context
  const discoverContext = await runCli(
    ["discover-context", ...PR_ARGS],
    workspaceRoot,
  );
  record("discover-context", discoverContext);

  // Step 4: map-tests
  const mapTests = await runCli(["map-tests", ...PR_ARGS], workspaceRoot);
  record("map-tests", mapTests);

  // Step 5: assess-gaps
  const assessGaps = await runCli(["assess-gaps", ...PR_ARGS], workspaceRoot);
  record("assess-gaps", assessGaps);

  const riskAssessmentId = assessGaps.riskAssessmentId as number;

  // Step 6: allocate run
  const allocate = await runCli(
    ["allocate run", "--risk-assessment-id", String(riskAssessmentId)],
    workspaceRoot,
  );
  record("allocate", allocate);

  // Step 7: handoff generate (no publish)
  const handoffGenerate = await runCli(
    ["handoff generate", "--risk-assessment-id", String(riskAssessmentId)],
    workspaceRoot,
  );
  record("handoff", handoffGenerate);

  // Step 8: generate-charters
  const generateCharters = await runCli(
    ["generate-charters", ...PR_ARGS],
    workspaceRoot,
  );
  record("generate-charters", generateCharters);

  const sessionChartersId = generateCharters.sessionChartersId as number;

  // Step 9: run-session (synthetic)
  const sessionStart = await runCli(
    [
      "session start",
      "--session-charters-id",
      String(sessionChartersId),
      "--charter-index",
      "0",
    ],
    workspaceRoot,
  );
  record("session-start", sessionStart);

  const sessionId = sessionStart.sessionId as number;

  const observe1 = await runCli(
    [
      "session observe",
      "--session",
      String(sessionId),
      "--heuristic",
      "error-guessing",
      "--action",
      "Submit task for approval as viewer role",
      "--expected",
      "Permission denied",
      "--actual",
      "Permission denied with clear error",
      "--outcome",
      "pass",
      "--note",
      "Role guard blocks unauthorized approval",
    ],
    workspaceRoot,
  );
  record("observe-1", observe1);

  const observe2 = await runCli(
    [
      "session observe",
      "--session",
      String(sessionId),
      "--heuristic",
      "error-guessing",
      "--action",
      "Reject task without providing a reason",
      "--expected",
      "Validation error requiring reason",
      "--actual",
      "Task rejected without reason",
      "--outcome",
      "fail",
      "--note",
      "Rejection reason validation missing",
    ],
    workspaceRoot,
  );
  record("observe-2", observe2);

  const sessionComplete = await runCli(
    ["session complete", "--session", String(sessionId)],
    workspaceRoot,
  );
  record("session-complete", sessionComplete);

  // Step 10: triage-findings (synthetic)
  const obs1Id = observe1.observationId as number;
  const obs2Id = observe2.observationId as number;

  const finding1 = await runCli(
    [
      "finding add",
      "--session",
      String(sessionId),
      "--observation",
      String(obs2Id),
      "--type",
      "defect",
      "--title",
      "Rejection reason validation missing",
      "--description",
      "Task can be rejected without reason",
      "--severity",
      "high",
    ],
    workspaceRoot,
  );
  record("finding-1", finding1);

  const finding2 = await runCli(
    [
      "finding add",
      "--session",
      String(sessionId),
      "--observation",
      String(obs1Id),
      "--type",
      "automation-candidate",
      "--title",
      "Role-based approval guard is deterministic",
      "--description",
      "Permission check can be covered by unit test",
      "--severity",
      "low",
      "--test-layer",
      "unit",
      "--rationale",
      "Deterministic role check with fixed inputs",
    ],
    workspaceRoot,
  );
  record("finding-2", finding2);

  const findingHandover = await runCli(
    ["finding handover", "--session", String(sessionId)],
    workspaceRoot,
  );
  record("finding-handover", findingHandover);

  // Step 11: export-artifacts
  const prIntakeId = prIntake.prIntakeId as number;
  const exportArtifacts = await runCli(
    ["export-artifacts", "--pr-intake-id", String(prIntakeId)],
    workspaceRoot,
  );
  record("export-artifacts", exportArtifacts);

  return {
    workspaceRoot,
    steps,
    setup,
    prIntake,
    discoverContext,
    mapTests,
    assessGaps,
    allocate,
    handoffGenerate,
    generateCharters,
    sessionStart,
    observe1,
    observe2,
    sessionComplete,
    finding1,
    finding2,
    findingHandover,
    exportArtifacts,
  };
}

// ---------------------------------------------------------------------------
// Top-level auth check
// ---------------------------------------------------------------------------

const ghAuthAvailable = await isGhAuthenticated();

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!ghAuthAvailable)(
  "CLI E2E: skill-first workflow",
  { timeout: 180_000 },
  () => {
    let workspaceRoot: string | undefined;
    let r: CliPipelineResults;

    beforeAll(async () => {
      workspaceRoot = await cloneAndPrepareWorkspace();
      r = await runCliPipeline(workspaceRoot);
    }, 180_000);

    afterAll(async () => {
      if (workspaceRoot) {
        const { rm } = await import("node:fs/promises");
        await rm(workspaceRoot, { recursive: true, force: true });
      }
    });

    // ---------------------------------------------------------------------
    // CLI-1: setup
    // ---------------------------------------------------------------------
    it("CLI-1: setup initializes workspace and returns database path", () => {
      expect(r.setup.databasePath).toBeTruthy();
      expect(r.setup.currentStep).toBe("pr-intake");
    });

    // ---------------------------------------------------------------------
    // CLI-2: pr-intake
    // ---------------------------------------------------------------------
    it("CLI-2: pr-intake returns prIntakeId and real metadata", () => {
      expect(r.prIntake.prIntakeId).toBeGreaterThan(0);
      expect(r.prIntake.repository).toBe(CANONICAL_REPO);
      expect(r.prIntake.prNumber).toBe(CANONICAL_PR_NUMBER);
      expect(r.prIntake.changedFiles as number).toBeGreaterThanOrEqual(
        MIN_CHANGED_FILES,
      );

      const intent = r.prIntake.intentContext as Record<string, unknown>;
      expect(intent).not.toBeNull();
      expect(intent.extractionStatus).not.toBe("empty");
      expect(intent.acceptanceCriteriaCount as number).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------
    // CLI-3: discover-context
    // ---------------------------------------------------------------------
    it("CLI-3: discover-context classifies changed files", () => {
      expect(r.discoverContext.filesAnalyzed as number).toBeGreaterThanOrEqual(
        MIN_CHANGED_FILES,
      );
      expect(r.discoverContext.status).toBe("completed");
    });

    // ---------------------------------------------------------------------
    // CLI-4: map-tests
    // ---------------------------------------------------------------------
    it("CLI-4: map-tests produces coverage gap map", () => {
      expect(r.mapTests.coverageGapEntries as number).toBeGreaterThan(0);
      expect(r.mapTests.testAssets as number).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------
    // CLI-5: assess-gaps
    // ---------------------------------------------------------------------
    it("CLI-5: assess-gaps returns riskAssessmentId and frameworks", () => {
      expect(r.assessGaps.riskAssessmentId).toBeGreaterThan(0);
      expect(r.assessGaps.frameworkSelections as number).toBeGreaterThanOrEqual(
        MIN_FRAMEWORKS,
      );
      expect(r.assessGaps.explorationThemes as number).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------
    // CLI-6: allocate
    // ---------------------------------------------------------------------
    it("CLI-6: allocate distributes items across destinations", () => {
      expect(r.allocate.allocatedItems as number).toBeGreaterThan(0);

      const counts = r.allocate.destinationCounts as Record<string, number>;
      const populated = Object.values(counts).filter((c) => c > 0).length;
      expect(populated).toBeGreaterThanOrEqual(MIN_DISTINCT_DESTINATIONS);
    });

    // ---------------------------------------------------------------------
    // CLI-7: handoff generate
    // ---------------------------------------------------------------------
    it("CLI-7: handoff generate produces markdown with sections", () => {
      const md = r.handoffGenerate.markdown as string;
      expect(md.length).toBeGreaterThan(100);
      expect(md).toContain(`#${CANONICAL_PR_NUMBER}`);
      expect(md).toContain("Already Covered");
      expect(md).toContain("Should Automate");
      expect(md).toContain("Manual Exploration Required");
    });

    // ---------------------------------------------------------------------
    // CLI-8: generate-charters
    // ---------------------------------------------------------------------
    it("CLI-8: generate-charters returns sessionChartersId", () => {
      expect(r.generateCharters.sessionChartersId).toBeGreaterThan(0);
      expect(r.generateCharters.chartersGenerated as number).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------
    // CLI-9: session lifecycle
    // ---------------------------------------------------------------------
    it("CLI-9: session start/observe/complete via CLI", () => {
      expect(r.sessionStart.sessionId).toBeGreaterThan(0);
      expect(r.sessionStart.status).toBe("in_progress");

      expect(r.observe1.observationId).toBeGreaterThan(0);
      expect(r.observe1.outcome).toBe("pass");

      expect(r.observe2.observationId).toBeGreaterThan(0);
      expect(r.observe2.outcome).toBe("fail");

      expect(r.sessionComplete.status).toBe("completed");
    });

    // ---------------------------------------------------------------------
    // CLI-10: finding add and handover
    // ---------------------------------------------------------------------
    it("CLI-10: finding add and handover via CLI", () => {
      expect(r.finding1.findingId).toBeGreaterThan(0);
      expect(r.finding2.findingId).toBeGreaterThan(0);
      expect(r.findingHandover.totalFindings).toBe(2);
    });

    // ---------------------------------------------------------------------
    // CLI-11: export-artifacts
    // ---------------------------------------------------------------------
    it("CLI-11: export-artifacts produces all artifact files", async () => {
      const artifacts = r.exportArtifacts.artifacts as Record<string, string>;
      const paths = Object.values(artifacts);
      expect(paths).toHaveLength(EXPECTED_ARTIFACT_COUNT);

      // All files exist and have content
      for (const p of paths) {
        const fullPath = resolve(r.workspaceRoot, p);
        const content = await readFile(fullPath, "utf8");
        expect(content.length, `Artifact at ${p} is empty`).toBeGreaterThan(50);
      }
    });

    // ---------------------------------------------------------------------
    // CLI-12: progress files
    // ---------------------------------------------------------------------
    it("CLI-12: progress files exist for completed steps", async () => {
      const handoverSteps = r.steps.filter((s) => s.data.handoverPath);
      expect(handoverSteps.length).toBeGreaterThanOrEqual(7);

      for (const step of handoverSteps) {
        const fullPath = resolve(
          r.workspaceRoot,
          step.data.handoverPath as string,
        );
        const info = await stat(fullPath);
        expect(info.isFile(), `${step.name}: handover file missing`).toBe(true);
      }
    });

    // ---------------------------------------------------------------------
    // CLI-13: JSON envelope contract
    // ---------------------------------------------------------------------
    it("CLI-13: all CLI responses returned status ok", () => {
      // This is implicitly validated by runCli (it throws on non-ok),
      // but we verify all steps were recorded successfully.
      expect(r.steps.length).toBeGreaterThanOrEqual(15);

      for (const step of r.steps) {
        expect(step.data, `${step.name}: data should not be null`).toBeTruthy();
      }
    });
  },
);
