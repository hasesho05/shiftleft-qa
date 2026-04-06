/**
 * Live E2E test: PR matrix for layer applicability validation.
 *
 * Tests multiple canonical PRs with different test asset combinations to
 * verify that layer applicability, handoff wording, and manual exploration
 * scope vary correctly by PR type.
 *
 * PR matrix:
 *   - PR #3: Frontend component + Storybook + Vitest (no Playwright)
 *   - PR #4: Frontend route + Playwright + Vitest (no Storybook)
 *   - PR #5: Backend-only (Go domain + usecase)
 *   - PR #6: Mixed frontend + backend with partial assets
 *
 * Prerequisites:
 *   - `gh auth login` with access to the sample repository
 *   - Network connectivity to GitHub
 *   - All matrix PRs must be open and unmerged in the sample repo
 *
 * Run with: bun run test:live-e2e
 * NOT included in `bun run check` or `bun run test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CANONICAL_REPO,
  type CanonicalPRConfig,
  type LayerKey,
  PR_MATRIX,
} from "./config";
import {
  cleanupWorkspace,
  cloneAndPrepareWorkspace,
  isGhAuthenticated,
  runCli,
} from "./helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatrixPipelineResult = {
  readonly workspaceRoot: string;
  readonly prIntake: Record<string, unknown>;
  readonly riskAssessmentId: number;
  readonly handoffMarkdown: string;
};

// ---------------------------------------------------------------------------
// Pipeline runner (setup → allocate → handoff generate)
// ---------------------------------------------------------------------------

async function runMatrixPipeline(
  prNumber: number,
): Promise<MatrixPipelineResult> {
  const workspaceRoot = await cloneAndPrepareWorkspace(
    `shiftleft-qa-matrix-pr${prNumber}-`,
  );

  const prArgs = [
    "--pr",
    String(prNumber),
    "--provider",
    "github",
    "--repository",
    CANONICAL_REPO,
  ] as const;

  await runCli(["setup"], workspaceRoot);

  const prIntake = await runCli(
    ["pr-intake", "--pr", String(prNumber)],
    workspaceRoot,
  );

  await runCli(["discover-context", ...prArgs], workspaceRoot);
  await runCli(["map-tests", ...prArgs], workspaceRoot);

  const assessGaps = await runCli(["assess-gaps", ...prArgs], workspaceRoot);
  const riskAssessmentId = assessGaps.riskAssessmentId as number;

  await runCli(
    ["allocate run", "--risk-assessment-id", String(riskAssessmentId)],
    workspaceRoot,
  );

  const handoffGenerate = await runCli(
    ["handoff generate", "--risk-assessment-id", String(riskAssessmentId)],
    workspaceRoot,
  );

  return {
    workspaceRoot,
    prIntake,
    riskAssessmentId,
    handoffMarkdown: handoffGenerate.markdown as string,
  };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * The handoff markdown renders layer applicability as:
 *   - **<layer>**: `<status>` — <reason>
 *
 * Check that a layer's status is one of the given values.
 */
function assertLayerStatus(
  markdown: string,
  layer: LayerKey,
  expectedStatuses: readonly string[],
): void {
  // Layer labels used in renderLayerApplicabilitySection
  const layerLabels: Record<LayerKey, string> = {
    unit: "unit",
    "integration-service": "integration/service",
    "ui-e2e": "ui/e2e",
    visual: "visual",
    "manual-exploration": "manual exploration",
  };

  const label = layerLabels[layer];
  const escaped = label.replace("/", "\\/");
  const backtick = "`";
  const pattern = new RegExp(
    `\\*\\*${escaped}\\*\\*:\\s*${backtick}([^${backtick}]+)${backtick}`,
  );
  const match = markdown.match(pattern);

  expect(match, `Layer "${label}" not found in markdown`).toBeTruthy();

  const actualStatus = match?.[1] ?? "";
  expect(
    expectedStatuses.some((s) => actualStatus.includes(s)),
    `Layer "${label}" status "${actualStatus}" not in [${expectedStatuses.join(", ")}]`,
  ).toBe(true);
}

// ---------------------------------------------------------------------------
// Top-level auth check
// ---------------------------------------------------------------------------

const ghAuthAvailable = await isGhAuthenticated();

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!ghAuthAvailable)(
  "live E2E: PR matrix",
  { timeout: 600_000 },
  () => {
    for (const pr of PR_MATRIX) {
      describePR(pr);
    }
  },
);

function describePR(pr: CanonicalPRConfig): void {
  describe(`PR #${pr.prNumber} (${pr.label})`, { timeout: 240_000 }, () => {
    let result: MatrixPipelineResult;

    beforeAll(async () => {
      result = await runMatrixPipeline(pr.prNumber);
    }, 240_000);

    afterAll(async () => {
      if (result?.workspaceRoot) {
        await cleanupWorkspace(result.workspaceRoot);
      }
    });

    // ---------------------------------------------------------------
    // MATRIX-1: pr-intake captures metadata
    // ---------------------------------------------------------------
    it("MATRIX-1: pr-intake captures changed files and intent context", () => {
      expect(result.prIntake.prNumber).toBe(pr.prNumber);
      expect(result.prIntake.changedFiles as number).toBeGreaterThanOrEqual(
        pr.minChangedFiles,
      );

      if (pr.expectIntentContext) {
        const intent = result.prIntake.intentContext as Record<string, unknown>;
        expect(intent).not.toBeNull();
        expect(intent.extractionStatus).not.toBe("empty");
      }
    });

    // ---------------------------------------------------------------
    // MATRIX-2: expected primary layers have correct status
    // ---------------------------------------------------------------
    it("MATRIX-2: primary layers are marked as primary or secondary", () => {
      for (const layer of pr.expectedPrimaryLayers) {
        assertLayerStatus(result.handoffMarkdown, layer, [
          "primary",
          "secondary",
        ]);
      }
    });

    // ---------------------------------------------------------------
    // MATRIX-3: expected not-primary layers have correct status
    // ---------------------------------------------------------------
    it("MATRIX-3: not-primary layers are marked as not-primary or no-product-change", () => {
      for (const layer of pr.expectedNotPrimaryLayers) {
        assertLayerStatus(result.handoffMarkdown, layer, [
          "not-primary",
          "no-product-change",
        ]);
      }
    });

    // ---------------------------------------------------------------
    // MATRIX-4: stability notes presence
    // ---------------------------------------------------------------
    it("MATRIX-4: stability notes presence matches expectation", () => {
      const hasStabilityNotes =
        result.handoffMarkdown.includes("既存テストの注意点");
      if (pr.expectStabilityNotes) {
        expect(hasStabilityNotes).toBe(true);
      }
      // When not expected, we don't assert absence because stability notes
      // may still appear from heuristic matching — we only assert presence
      // when expected.
    });

    // ---------------------------------------------------------------
    // MATRIX-5: handoff structure is complete
    // ---------------------------------------------------------------
    it("MATRIX-5: handoff markdown has required sections", () => {
      expect(result.handoffMarkdown).toContain("Already Covered");
      expect(result.handoffMarkdown).toContain("Should Automate");
      expect(result.handoffMarkdown).toContain("Manual Exploration Required");
      expect(result.handoffMarkdown).toContain("Layer Applicability");
      expect(result.handoffMarkdown).toContain(`#${pr.prNumber}`);
    });
  });
}
