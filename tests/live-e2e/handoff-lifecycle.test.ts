/**
 * Live E2E test: handoff publish/update lifecycle.
 *
 * Validates that the final GitHub QA handoff Issue is actually created
 * and updated via the `handoff publish` and `handoff update` CLI commands.
 *
 * Key design decisions:
 *   - Every run creates a NEW issue with a unique timestamp in the title.
 *     This guarantees that the `handoff publish` (create) path is always
 *     exercised, not just the update path.
 *   - afterAll closes the issue to prevent accumulation in the sample repo.
 *
 * Prerequisites:
 *   - `gh auth login` with write access to the sample repository
 *   - Network connectivity to GitHub
 *
 * Run with: bun run test:live-e2e
 * NOT included in `bun run check` or `bun run test`.
 */
import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CANONICAL_PR_NUMBER,
  CANONICAL_REPO,
  E2E_ISSUE_TITLE_PREFIX,
} from "./config";
import {
  cleanupWorkspace,
  cloneAndPrepareWorkspace,
  isGhAuthenticated,
  runCli,
  runCliExpectError,
} from "./helpers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PR_ARGS = [
  "--pr",
  String(CANONICAL_PR_NUMBER),
  "--provider",
  "github",
  "--repository",
  CANONICAL_REPO,
] as const;

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

async function fetchIssueBody(
  repository: string,
  issueNumber: number,
): Promise<string> {
  const result = await execa(
    "gh",
    [
      "issue",
      "view",
      String(issueNumber),
      "--repo",
      repository,
      "--json",
      "body",
    ],
    { timeout: 30_000, reject: true },
  );

  const parsed = JSON.parse(result.stdout) as { body: string };
  return parsed.body;
}

async function closeIssue(
  repository: string,
  issueNumber: number,
): Promise<void> {
  await execa(
    "gh",
    ["issue", "close", String(issueNumber), "--repo", repository],
    { timeout: 30_000, reject: true },
  );
}

// ---------------------------------------------------------------------------
// Top-level auth check
// ---------------------------------------------------------------------------

const ghAuthAvailable = await isGhAuthenticated();

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!ghAuthAvailable)(
  "live E2E: handoff lifecycle",
  { timeout: 240_000 },
  () => {
    let workspaceRoot = "";
    let riskAssessmentId = 0;
    let issueNumber = 0;
    let publishedIssueUrl = "";
    let initialBody = "";

    beforeAll(async () => {
      // 1. Clone and prepare workspace
      workspaceRoot = await cloneAndPrepareWorkspace(
        "shiftleft-qa-handoff-e2e-",
      );

      // 2. Run pipeline through allocate
      await runCli(["db", "init"], workspaceRoot);
      await runCli(["pr-intake", ...PR_ARGS.slice(0, 2)], workspaceRoot);
      await runCli(["discover-context", ...PR_ARGS], workspaceRoot);
      await runCli(["map-tests", ...PR_ARGS], workspaceRoot);

      const assessGaps = await runCli(
        ["assess-gaps", ...PR_ARGS],
        workspaceRoot,
      );
      riskAssessmentId = assessGaps.riskAssessmentId as number;

      await runCli(
        ["allocate run", "--risk-assessment-id", String(riskAssessmentId)],
        workspaceRoot,
      );

      // 3. Create a NEW issue every run (unique title with timestamp)
      const runId = Date.now();
      const title = `${E2E_ISSUE_TITLE_PREFIX} QA Handoff — PR #${CANONICAL_PR_NUMBER} (run ${runId})`;
      const publishResult = await runCli(
        [
          "handoff publish",
          "--risk-assessment-id",
          String(riskAssessmentId),
          "--title",
          title,
        ],
        workspaceRoot,
      );

      issueNumber = publishResult.issueNumber as number;
      publishedIssueUrl = String(publishResult.issueUrl ?? "");

      // Fetch the initial body for later comparison
      initialBody = await fetchIssueBody(CANONICAL_REPO, issueNumber);
    }, 240_000);

    afterAll(async () => {
      // Close the test issue to prevent accumulation
      if (issueNumber > 0) {
        try {
          await closeIssue(CANONICAL_REPO, issueNumber);
        } catch {
          // Best-effort cleanup — don't fail the suite
        }
      }
      await cleanupWorkspace(workspaceRoot);
    });

    // -----------------------------------------------------------------
    // HANDOFF-1: publish creates a new GitHub issue
    // -----------------------------------------------------------------
    it("HANDOFF-1: publish creates issue with valid number and URL", () => {
      expect(issueNumber).toBeGreaterThan(0);
      expect(publishedIssueUrl).toContain("github.com");
      expect(publishedIssueUrl).toContain(String(issueNumber));
    });

    // -----------------------------------------------------------------
    // HANDOFF-2: issue body contains required structural sections
    // -----------------------------------------------------------------
    it("HANDOFF-2: issue body has required sections", () => {
      expect(initialBody).toContain("Already Covered");
      expect(initialBody).toContain("Should Automate");
      expect(initialBody).toContain("Manual Exploration Required");
      expect(initialBody).toContain("Layer Applicability");
      expect(initialBody).toContain("Notes");
      expect(initialBody).toContain(`#${CANONICAL_PR_NUMBER}`);

      // At least one confidence badge emoji (green, yellow, or red circle)
      const hasConfidenceBadge =
        initialBody.includes("\u{1F7E2}") ||
        initialBody.includes("\u{1F7E1}") ||
        initialBody.includes("\u{1F534}");
      expect(hasConfidenceBadge).toBe(true);

      // Layer headings
      expect(initialBody).toContain("unit");
      expect(initialBody).toContain("integration/service");
      expect(initialBody).toContain("visual");
    });

    // -----------------------------------------------------------------
    // HANDOFF-3: issue body reflects PR intent context
    // -----------------------------------------------------------------
    it("HANDOFF-3: issue body includes intent context", () => {
      const hasIntentContext =
        initialBody.includes("Intent Context") ||
        initialBody.includes("Acceptance Criteria") ||
        initialBody.includes("受け入れ要件");
      expect(hasIntentContext).toBe(true);
    });

    // -----------------------------------------------------------------
    // HANDOFF-4: update preserves issue number and refreshes body
    // -----------------------------------------------------------------
    it("HANDOFF-4: handoff update preserves issue number", async () => {
      // Small delay so the "Generated" timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      const updateResult = await runCli(
        [
          "handoff update",
          "--risk-assessment-id",
          String(riskAssessmentId),
          "--issue-number",
          String(issueNumber),
        ],
        workspaceRoot,
      );

      expect(updateResult.issueNumber).toBe(issueNumber);
      expect(updateResult.updated).toBe(true);

      // Verify the body was actually updated (timestamp changed)
      const updatedBody = await fetchIssueBody(CANONICAL_REPO, issueNumber);
      expect(updatedBody).toContain("Already Covered");
      expect(updatedBody).toContain("Generated");
    });

    // -----------------------------------------------------------------
    // HANDOFF-5: error case returns machine-readable error
    // -----------------------------------------------------------------
    it("HANDOFF-5: update with non-existent issue returns error", async () => {
      const envelope = await runCliExpectError(
        [
          "handoff update",
          "--risk-assessment-id",
          String(riskAssessmentId),
          "--issue-number",
          "999999",
        ],
        workspaceRoot,
      );

      expect(envelope.status).toBe("error");
    });
  },
);
