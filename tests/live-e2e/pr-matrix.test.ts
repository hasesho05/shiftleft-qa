/**
 * Live E2E test: PR matrix for layer applicability validation.
 *
 * Tests multiple canonical PRs with different test asset combinations to
 * verify that layer applicability, handoff wording, and manual exploration
 * scope vary correctly by PR type.
 *
 * Pipeline: analyze-pr → design-handoff (then generate handoff markdown
 * directly to inspect section content without publishing to GitHub).
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

import { findLatestRiskAssessmentByPr } from "../../src/exploratory-testing/db/workspace-repository";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { generateHandoffMarkdown } from "../../src/exploratory-testing/tools/handoff";

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
  readonly analyzePr: Record<string, unknown>;
  readonly handoffMarkdown: string;
};

// ---------------------------------------------------------------------------
// Pipeline runner (analyze-pr → design-handoff → generate markdown)
// ---------------------------------------------------------------------------

async function runMatrixPipeline(
  prNumber: number,
): Promise<MatrixPipelineResult> {
  const workspaceRoot = await cloneAndPrepareWorkspace(
    `shiftleft-qa-matrix-pr${prNumber}-`,
  );

  await runCli(["db", "init"], workspaceRoot);

  // Run public flow: analyze-pr → design-handoff
  const analyzePr = await runCli(
    ["analyze-pr", "--pr", String(prNumber)],
    workspaceRoot,
  );

  await runCli(["design-handoff", "--pr", String(prNumber)], workspaceRoot);

  // Generate handoff markdown directly (design-handoff CLI doesn't return
  // the full markdown — it returns structured counts. We call the tool
  // function to get the markdown for section assertions.)
  const configPath = `${workspaceRoot}/config.json`;
  const manifestPath = `${workspaceRoot}/.claude-plugin/plugin.json`;
  const config = await readPluginConfig(configPath, manifestPath);

  const riskAssessment = findLatestRiskAssessmentByPr(
    config.paths.database,
    "github",
    CANONICAL_REPO,
    prNumber,
  );

  if (!riskAssessment) {
    throw new Error(`No risk assessment found for PR #${prNumber}`);
  }

  const handoff = await generateHandoffMarkdown({
    riskAssessmentId: riskAssessment.id,
    configPath,
    manifestPath,
  });

  return {
    workspaceRoot,
    analyzePr,
    handoffMarkdown: handoff.markdown,
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
    // MATRIX-1: analyze-pr captures metadata
    // ---------------------------------------------------------------
    it("MATRIX-1: analyze-pr captures changed files and intent context", () => {
      expect(result.analyzePr.prNumber).toBe(pr.prNumber);
      const changedFiles = result.analyzePr.changedFiles as {
        total: number;
      };
      expect(changedFiles.total).toBeGreaterThanOrEqual(pr.minChangedFiles);

      if (pr.expectIntentContext) {
        const intent = result.analyzePr.intentContext as Record<
          string,
          unknown
        >;
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
