import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TestWorkspace = {
  readonly root: string;
  readonly manifestPath: string;
  readonly configPath: string;
};

export async function createTestWorkspace(): Promise<TestWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "exploratory-testing-plugin-"));
  const pluginDirectory = join(root, ".claude-plugin");
  const manifestPath = join(pluginDirectory, "plugin.json");
  const configPath = join(root, "config.json");

  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        name: "exploratory-testing-plugin",
        version: "0.1.0",
        description:
          "Claude Code plugin scaffold for post-implementation exploratory testing.",
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

export async function cleanupTestWorkspace(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
