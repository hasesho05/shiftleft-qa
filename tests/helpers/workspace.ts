import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TestWorkspace = {
  readonly root: string;
  readonly manifestPath: string;
  readonly configPath: string;
};

export async function createTestWorkspace(): Promise<TestWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "shiftleft-qa-"));
  const pluginDirectory = join(root, ".claude-plugin");
  const manifestPath = join(pluginDirectory, "plugin.json");
  const configPath = join(root, "config.json");

  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
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
    )}\n`,
    "utf8",
  );

  return {
    root,
    manifestPath,
    configPath,
  };
}

/**
 * Create a test workspace pre-populated with sample app fixture files.
 *
 * The fixture layout gives the heuristic engine real file paths to classify
 * (unit tests, integration tests, source files) so that test-mapping and
 * allocation produce realistic results.
 */
export async function createTestWorkspaceWithSampleApp(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();

  // Stub source files (content is irrelevant — the pipeline works off paths)
  const sourceFiles = [
    "src/components/TaskList.tsx",
    "src/api/routes/tasks.ts",
    "src/validators/task-schema.ts",
    "src/store/task-state.ts",
    "src/middleware/role-guard.ts",
    "prisma/migrations/001_tasks.sql",
    "src/lib/status-badge.tsx",
    "src/pages/task-detail.tsx",
  ];

  // Partial test coverage — only some files have tests
  const testFiles = [
    "tests/unit/task-schema.test.ts",
    "tests/integration/tasks-api.test.ts",
  ];

  const allFiles = [...sourceFiles, ...testFiles];

  await Promise.all(
    allFiles.map(async (filePath) => {
      const fullPath = join(workspace.root, filePath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, `// stub: ${filePath}\n`, "utf8");
    }),
  );

  return workspace;
}

export async function cleanupTestWorkspace(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
