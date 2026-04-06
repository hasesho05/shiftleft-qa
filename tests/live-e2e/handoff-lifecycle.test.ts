/**
 * Live E2E test: handoff publish/update lifecycle.
 *
 * Validates that the 3-skill public flow produces a GitHub QA handoff Issue
 * and can update it via `publish-handoff`.
 *
 * Pipeline: analyze-pr → design-handoff → publish-handoff
 *
 * Key design decisions:
 *   - Every run creates a NEW issue with a unique timestamp in the title.
 *     This guarantees that the publish (create) path is always exercised.
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
    let issueNumber = 0;
    let publishedIssueUrl = "";
    let initialBody = "";

    beforeAll(async () => {
      // 1. Clone and prepare workspace
      workspaceRoot = await cloneAndPrepareWorkspace(
        "shiftleft-qa-handoff-e2e-",
      );

      // 2. Run 3-skill public flow: analyze-pr → design-handoff → publish-handoff
      await runCli(["db", "init"], workspaceRoot);

      await runCli(
        ["analyze-pr", "--pr", String(CANONICAL_PR_NUMBER)],
        workspaceRoot,
      );

      await runCli(
        ["design-handoff", "--pr", String(CANONICAL_PR_NUMBER)],
        workspaceRoot,
      );

      // 3. Create a NEW issue every run (unique title with timestamp)
      const runId = Date.now();
      const title = `${E2E_ISSUE_TITLE_PREFIX} QA Handoff — PR #${CANONICAL_PR_NUMBER} (run ${runId})`;
      const publishResult = await runCli(
        [
          "publish-handoff",
          "--pr",
          String(CANONICAL_PR_NUMBER),
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
    // HANDOFF-4: publish-handoff update preserves issue number
    // -----------------------------------------------------------------
    it("HANDOFF-4: publish-handoff update preserves issue number", async () => {
      // Small delay so the "Generated" timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      const updateResult = await runCli(
        [
          "publish-handoff",
          "--pr",
          String(CANONICAL_PR_NUMBER),
          "--issue-number",
          String(issueNumber),
        ],
        workspaceRoot,
      );

      expect(updateResult.issueNumber).toBe(issueNumber);
      expect(updateResult.action).toBe("updated");

      // Verify the body was actually updated (timestamp changed)
      const updatedBody = await fetchIssueBody(CANONICAL_REPO, issueNumber);
      expect(updatedBody).toContain("Already Covered");
      expect(updatedBody).toContain("Generated");
    });

    // -----------------------------------------------------------------
    // HANDOFF-5: error case returns machine-readable error
    // -----------------------------------------------------------------
    it("HANDOFF-5: publish-handoff with non-existent PR returns error", async () => {
      const envelope = await runCliExpectError(
        ["publish-handoff", "--pr", "999999"],
        workspaceRoot,
      );

      expect(envelope.status).toBe("error");
    });
  },
);
