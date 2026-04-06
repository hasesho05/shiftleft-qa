/**
 * Shared helpers for live E2E tests.
 *
 * Extracted from canonical-pr.test.ts and cli-workflow.test.ts to avoid
 * duplicating clone/setup/pipeline logic across multiple test files.
 */
import { resolve } from "node:path";
import { execa } from "execa";

import { CANONICAL_REPO_URL } from "./config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute path to CLI entry point. */
export const CLI_ENTRY_PATH = resolve(
  import.meta.dirname,
  "../../src/exploratory-testing/cli/index.ts",
);

/** Plugin manifest used by all live E2E tests. */
export const PLUGIN_MANIFEST = {
  name: "shiftleft-qa",
  version: "0.1.0",
  description:
    "Shift-left test allocation と GitHub QA handoff を支援する Claude Code Plugin。",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if the `gh` CLI is authenticated.
 */
export async function isGhAuthenticated(): Promise<boolean> {
  try {
    await execa("gh", ["auth", "status"], { reject: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone the sample app repository and prepare a workspace with config + manifest.
 *
 * @param prefix - Temp directory name prefix (for distinguishing test suites).
 */
export async function cloneAndPrepareWorkspace(
  prefix = "shiftleft-qa-live-e2e-",
): Promise<string> {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const root = await mkdtemp(join(tmpdir(), prefix));

  await execa("git", ["clone", "--depth", "1", CANONICAL_REPO_URL, root], {
    timeout: 60_000,
    reject: true,
  });

  const pluginDir = join(root, ".claude-plugin");
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, "plugin.json"),
    JSON.stringify(PLUGIN_MANIFEST, null, 2),
    "utf8",
  );

  await writeFile(join(root, "config.json"), "{}", "utf8");

  return root;
}

/**
 * Run a CLI command and parse the JSON envelope.
 * Throws if the envelope status is not "ok".
 */
export async function runCli(
  args: readonly string[],
  cwd: string,
): Promise<Record<string, unknown>> {
  const result = await execa("bun", ["run", CLI_ENTRY_PATH, ...args], {
    cwd,
    timeout: 60_000,
    reject: true,
  });

  const stdout = result.stdout.trim();
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(
      `No JSON in CLI output for [${args.join(" ")}]. stdout: "${stdout.slice(0, 200)}"`,
    );
  }
  const envelope = JSON.parse(stdout.slice(jsonStart)) as {
    status: string;
    data?: Record<string, unknown>;
    message?: string;
  };

  if (envelope.status !== "ok") {
    throw new Error(
      `CLI command failed: ${args.join(" ")} — ${envelope.message ?? JSON.stringify(envelope)}`,
    );
  }

  return envelope.data ?? {};
}

/**
 * Run a CLI command that is expected to fail. Returns the parsed envelope.
 */
export async function runCliExpectError(
  args: readonly string[],
  cwd: string,
): Promise<{ status: string; message?: string }> {
  try {
    const result = await execa("bun", ["run", CLI_ENTRY_PATH, ...args], {
      cwd,
      timeout: 60_000,
      reject: false,
    });

    const stdout = result.stdout.trim();
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      return { status: "error", message: result.stderr || "No JSON output" };
    }
    return JSON.parse(stdout.slice(jsonStart)) as {
      status: string;
      message?: string;
    };
  } catch {
    return { status: "error", message: "Process threw" };
  }
}

/**
 * Clean up a workspace temp directory.
 */
export async function cleanupWorkspace(workspaceRoot: string): Promise<void> {
  if (workspaceRoot.length > 0) {
    const { rm } = await import("node:fs/promises");
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}
