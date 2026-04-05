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
