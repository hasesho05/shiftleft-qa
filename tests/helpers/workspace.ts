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
