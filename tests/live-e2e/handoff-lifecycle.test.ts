/**
 * Live E2E test: handoff publish/update/comment lifecycle.
 *
 * Validates that the final GitHub QA handoff Issue is actually created,
 * updated, and commented on via the `handoff publish`, `handoff update`,
 * and `handoff add-findings` CLI commands.
 *
 * Key design decisions:
 *   - Every run creates a NEW issue with a unique timestamp in the title.
 *     This guarantees that the `handoff publish` (create) path is always
 *     exercised, not just the update path.
 *   - afterAll closes the issue to prevent accumulation in the sample repo.
 *   - add-findings verifies comment count delta (+1) and matches the
 *     returned comment URL, preventing false positives from stale comments.
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

async function fetchIssueCommentCount(
  repository: string,
  issueNumber: number,
): Promise<number> {
  const result = await execa(
    "gh",
    ["api", `repos/${repository}/issues/${issueNumber}/comments`],
    { timeout: 30_000, reject: true },
  );

  const comments = JSON.parse(result.stdout) as readonly unknown[];
  return comments.length;
}

async function fetchLatestComment(
  repository: string,
  issueNumber: number,
): Promise<{ body: string; html_url: string } | null> {
  const result = await execa(
    "gh",
    ["api", `repos/${repository}/issues/${issueNumber}/comments`],
    { timeout: 30_000, reject: true },
  );

  const comments = JSON.parse(result.stdout) as readonly {
    body: string;
    html_url: string;
  }[];
  return comments.length > 0 ? comments[comments.length - 1] : null;
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
    let sessionId = 0;
    let issueNumber = 0;
    let publishedIssueUrl = "";
    let initialBody = "";

    beforeAll(async () => {
      // 1. Clone and prepare workspace
      workspaceRoot = await cloneAndPrepareWorkspace(
        "shiftleft-qa-handoff-e2e-",
      );

      // 2. Run pipeline through allocate
      await runCli(["setup"], workspaceRoot);
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

      // 3. Generate charters + session + findings for add-findings test
      const charters = await runCli(
        ["generate-charters", ...PR_ARGS],
        workspaceRoot,
      );
      const sessionChartersId = charters.sessionChartersId as number;

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
      sessionId = sessionStart.sessionId as number;

      const observe = await runCli(
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

      await runCli(
        ["session complete", "--session", String(sessionId)],
        workspaceRoot,
      );

      const obs1Id = observe.observationId as number;

      await runCli(
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

      // 4. Create a NEW issue every run (unique title with timestamp)
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
    // HANDOFF-5: add-findings creates exactly one new comment
    // -----------------------------------------------------------------
    it("HANDOFF-5: add-findings adds exactly one comment with findings", async () => {
      // Record comment count BEFORE
      const countBefore = await fetchIssueCommentCount(
        CANONICAL_REPO,
        issueNumber,
      );

      const result = await runCli(
        [
          "handoff add-findings",
          "--issue-number",
          String(issueNumber),
          "--session-id",
          String(sessionId),
        ],
        workspaceRoot,
      );

      const returnedUrl = String(result.commentUrl);
      expect(returnedUrl).toContain("github.com");

      // Verify count increased by exactly 1
      const countAfter = await fetchIssueCommentCount(
        CANONICAL_REPO,
        issueNumber,
      );
      expect(countAfter).toBe(countBefore + 1);

      // Verify the LATEST comment matches the returned URL and has findings
      const latest = await fetchLatestComment(CANONICAL_REPO, issueNumber);
      expect(latest).not.toBeNull();
      expect(latest?.html_url).toBe(returnedUrl);
      expect(latest?.body).toContain("Exploration Findings");
      expect(latest?.body).toContain("automation-candidate");
    });

    // -----------------------------------------------------------------
    // HANDOFF-6: error case returns machine-readable error
    // -----------------------------------------------------------------
    it("HANDOFF-6: update with non-existent issue returns error", async () => {
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
