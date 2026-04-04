import type { PrMetadata } from "../../../src/exploratory-testing/models/pr-intake";

/**
 * PR metadata fixture for the "Task Board" sample app.
 *
 * 8 changed files designed to exercise multiple allocation destinations:
 *
 * - ui:               TaskList.tsx              → visual
 * - api + async:      routes/tasks.ts           → integration
 * - validation:       validators/task-schema.ts → unit
 * - state-transition: store/task-state.ts       → unit
 * - permission:       middleware/role-guard.ts   → review
 * - schema:           migrations/001_tasks.sql  → integration
 * - shared-component: lib/status-badge.tsx      → visual (manual-exploration fallback)
 * - ui (flow path):   pages/task-detail.tsx     → e2e
 *
 * The PR description embeds intent context (user story, acceptance criteria,
 * non-goals) so that pr-intake can extract it and propagate downstream.
 */
export function createSampleAppPrMetadata(): PrMetadata {
  return {
    provider: "github",
    repository: "acme/task-board",
    prNumber: 55,
    title: "Add task status transitions with role-based permissions",
    description: [
      "Implements task CRUD and status transition logic with role-based guards.",
      "",
      "## User Story",
      "",
      "As a project member, I want to manage tasks with status transitions",
      "and assignee permissions so that the team can track work progress.",
      "",
      "## Acceptance Criteria",
      "",
      "- Tasks can be created with title, description, and assignee",
      "- Status transitions follow: draft -> open -> in_progress -> done",
      "- Only the assignee or an admin can move a task to in_progress",
      "- Invalid transitions return a clear validation error",
      "- The task list page renders correctly with status badges",
      "",
      "## Non-Goals",
      "",
      "- Real-time collaboration or WebSocket push",
      "- File attachments or rich text editing",
    ].join("\n"),
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/task-transitions",
    headSha: "f1a2b3c4",
    linkedIssues: ["ACME-55", "ACME-56"],
    changedFiles: [
      // ui — non-flow path → visual
      {
        path: "src/components/TaskList.tsx",
        status: "added",
        additions: 95,
        deletions: 0,
        previousPath: null,
      },
      // api + async → integration
      {
        path: "src/api/routes/tasks.ts",
        status: "modified",
        additions: 60,
        deletions: 8,
        previousPath: null,
      },
      // validation → unit
      {
        path: "src/validators/task-schema.ts",
        status: "added",
        additions: 45,
        deletions: 0,
        previousPath: null,
      },
      // state-transition → unit
      {
        path: "src/store/task-state.ts",
        status: "modified",
        additions: 40,
        deletions: 12,
        previousPath: null,
      },
      // permission → review
      {
        path: "src/middleware/role-guard.ts",
        status: "added",
        additions: 35,
        deletions: 0,
        previousPath: null,
      },
      // schema (migration) → integration
      {
        path: "prisma/migrations/001_tasks.sql",
        status: "added",
        additions: 30,
        deletions: 0,
        previousPath: null,
      },
      // shared-component (ui, non-flow) → visual / may land in manual-exploration
      {
        path: "src/lib/status-badge.tsx",
        status: "added",
        additions: 25,
        deletions: 0,
        previousPath: null,
      },
      // ui — flow path (pages/) → e2e
      {
        path: "src/pages/task-detail.tsx",
        status: "added",
        additions: 110,
        deletions: 0,
        previousPath: null,
      },
    ],
    reviewComments: [
      {
        author: "bob",
        body: "Should we also guard the delete action with admin-only permission?",
        path: "src/middleware/role-guard.ts",
        createdAt: "2026-04-01T14:00:00Z",
      },
    ],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}
