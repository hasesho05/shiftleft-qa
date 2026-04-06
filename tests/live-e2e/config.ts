/**
 * Configuration for the live E2E test against the canonical sample app repository.
 *
 * The sample app is a task management application hosted at
 * hasesho05/shiftleft-qa-sample-app with the following stack contract:
 *
 *   - Backend:  Go (net/http) — domain / usecase / handler / middleware
 *   - Frontend: Vite + React + TypeScript
 *   - UI tests: Storybook stories (.stories.tsx)
 *   - Unit/component tests: Vitest (frontend), Go test (backend)
 *
 * The canonical PR (#2) adds an approval workflow with role-based permissions,
 * touching both backend and frontend files (mixed PR).
 *
 * These constants define the test target and minimum invariant thresholds.
 * Update them only when the canonical PR is intentionally refreshed.
 * When refreshing, maintain the stack contract above and ensure all
 * MIN_* thresholds still hold.
 */

/** GitHub repository slug (owner/name). */
export const CANONICAL_REPO = "hasesho05/shiftleft-qa-sample-app";

/** HTTPS clone URL. */
export const CANONICAL_REPO_URL = `https://github.com/${CANONICAL_REPO}.git`;

/** The canonical PR number to test against. Must remain open and unmerged. */
export const CANONICAL_PR_NUMBER = 2;

// ---------------------------------------------------------------------------
// Minimum invariant thresholds (conservative lower bounds)
// ---------------------------------------------------------------------------

/** Minimum number of changed files the PR should report. */
export const MIN_CHANGED_FILES = 8;

/** Minimum number of distinct change categories across all files. */
export const MIN_CATEGORIES = 4;

/** Minimum number of viewpoint groups that have at least one seed. */
export const MIN_VIEWPOINTS_WITH_SEEDS = 2;

/** Minimum number of distinct frameworks selected by assess-gaps. */
export const MIN_FRAMEWORKS = 2;

/** Number of artifact files exported (exploration-brief, coverage-gap-map, etc.). */
export const EXPECTED_ARTIFACT_COUNT = 6;

/** Minimum number of distinct allocation destinations populated. */
export const MIN_DISTINCT_DESTINATIONS = 2;

// ---------------------------------------------------------------------------
// E2E handoff issue identification (used by handoff-lifecycle.test.ts)
// ---------------------------------------------------------------------------

/** Marker embedded as HTML comment in test-created issues for deterministic lookup. */
export const E2E_ISSUE_MARKER = "shiftleft-qa-live-e2e";

/** Title prefix for test-created handoff issues. */
export const E2E_ISSUE_TITLE_PREFIX = `[${E2E_ISSUE_MARKER}]`;

// ---------------------------------------------------------------------------
// PR matrix for layer applicability testing (used by pr-matrix.test.ts)
// ---------------------------------------------------------------------------

/**
 * Layer applicability keys as used by the `assessLayerApplicability` output.
 * These match the keys in `LAYER_APPLICABILITY_LAYERS`.
 */
export type LayerKey =
  | "unit"
  | "integration-service"
  | "ui-e2e"
  | "visual"
  | "manual-exploration";

export type CanonicalPRConfig = {
  /** PR number in the sample repository. Must remain open and unmerged. */
  readonly prNumber: number;
  /** Human-readable label for test output. */
  readonly label: string;
  /** PR archetype. */
  readonly type:
    | "frontend-storybook"
    | "frontend-playwright"
    | "backend-only"
    | "mixed-partial";
  /** Minimum number of changed files. */
  readonly minChangedFiles: number;
  /** Layers expected to be "primary" or "secondary". */
  readonly expectedPrimaryLayers: readonly LayerKey[];
  /** Layers expected to be "not-primary" or "no-product-change". */
  readonly expectedNotPrimaryLayers: readonly LayerKey[];
  /** Whether stability notes are expected in the handoff output. */
  readonly expectStabilityNotes: boolean;
  /** Whether structured intent context is expected. */
  readonly expectIntentContext: boolean;
};

/**
 * PR matrix — each entry represents a canonical PR with a distinct test asset
 * combination. All PRs must remain open (unmerged) in the sample repository.
 *
 * PR #3: Frontend component + Storybook + Vitest (no Playwright)
 * PR #4: Frontend route + Playwright + Vitest (no Storybook)
 * PR #5: Backend-only (Go domain + usecase with Go tests)
 * PR #6: Mixed frontend + backend with partial test assets (Vitest only)
 */
/**
 * Layer applicability expectations below are derived from running the full
 * pipeline against each canonical PR and recording the actual output.
 *
 * The key invariants being guarded are:
 *   - PR #3 (Storybook): visual=primary because stories are changed
 *   - PR #4 (Playwright): ui-e2e=primary because route + e2e spec are changed
 *   - PR #5 (backend-only): ALL four auto-test layers are not-primary
 *   - PR #6 (mixed): visual + ui-e2e = primary because frontend component is changed
 *   - PR #3 vs #5: visual diverges (primary vs not-primary)
 *   - PR #4 vs #3: ui-e2e diverges (primary vs secondary)
 *   - PR #5 is the only case where ui-e2e AND visual are both not-primary
 */
export const PR_MATRIX: readonly CanonicalPRConfig[] = [
  {
    prNumber: 3,
    label: "frontend-storybook",
    type: "frontend-storybook",
    minChangedFiles: 3,
    expectedPrimaryLayers: ["unit", "visual"],
    expectedNotPrimaryLayers: ["integration-service"],
    expectStabilityNotes: false,
    expectIntentContext: true,
  },
  {
    prNumber: 4,
    label: "frontend-playwright",
    type: "frontend-playwright",
    minChangedFiles: 4,
    expectedPrimaryLayers: ["ui-e2e", "visual"],
    expectedNotPrimaryLayers: ["unit", "integration-service"],
    expectStabilityNotes: false,
    expectIntentContext: true,
  },
  {
    prNumber: 5,
    label: "backend-only",
    type: "backend-only",
    minChangedFiles: 4,
    expectedPrimaryLayers: [],
    expectedNotPrimaryLayers: [
      "unit",
      "integration-service",
      "ui-e2e",
      "visual",
    ],
    expectStabilityNotes: false,
    expectIntentContext: true,
  },
  {
    prNumber: 6,
    label: "mixed-partial",
    type: "mixed-partial",
    minChangedFiles: 5,
    expectedPrimaryLayers: ["ui-e2e", "visual"],
    expectedNotPrimaryLayers: ["integration-service"],
    expectStabilityNotes: false,
    expectIntentContext: true,
  },
];
