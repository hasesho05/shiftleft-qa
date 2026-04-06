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
        },
        skills: [
          {
            name: "capabilities",
            path: "skills/capabilities/SKILL.md",
            description:
              "shiftleft-qa の対応範囲、前提、非対応事項を案内する。",
          },
          {
            name: "analyze-pr",
            path: "skills/analyze-pr/SKILL.md",
            description:
              "Public flow 1/3: PR を解析し intent context・既存テスト・risk を一括取得する。",
          },
          {
            name: "design-handoff",
            path: "skills/design-handoff/SKILL.md",
            description:
              "Public flow 2/3: analysis から QA handoff ドラフトを生成する。",
          },
          {
            name: "publish-handoff",
            path: "skills/publish-handoff/SKILL.md",
            description:
              "Public flow 3/3: QA handoff を GitHub Issue として publish / update する。",
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
