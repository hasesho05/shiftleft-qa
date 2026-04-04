import { spawnSync } from "node:child_process";

import {
  type DivergenceEntry,
  type StaleStepInfo,
  detectAllStaleSteps,
  detectProgressDivergence,
  getDatabasePragmas,
} from "../db/workspace-repository";
import type { ResolvedPluginConfig } from "../models/config";

export type ToolStatus = "ok" | "missing";

export interface ToolCheck {
  name: string;
  required: boolean;
  detected: boolean;
  version: string | null;
}

export interface EnvironmentReport {
  runtime: {
    bunVersion: string | null;
    nodeVersion: string | null;
  };
  tools: ToolCheck[];
}

const SPAWN_TIMEOUT_MS = 5_000;

function detectVersion(
  commandName: string,
  versionArgs: string[] = ["--version"],
): string | null {
  const result = spawnSync(commandName, versionArgs, {
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  const output = result.stdout.trim();
  return output.length > 0 ? output : null;
}

export function getToolStatus(tool: ToolCheck): ToolStatus {
  return tool.detected ? "ok" : "missing";
}

function isCommandAvailable(commandName: string): boolean {
  const result = spawnSync("which", [commandName], {
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });

  return result.status === 0 && !result.error;
}

function buildToolCheck(
  name: string,
  required: boolean,
  versionArgs: string[] = ["--version"],
): ToolCheck {
  const detected = isCommandAvailable(name);
  return {
    name,
    required,
    detected,
    version: detected ? detectVersion(name, versionArgs) : null,
  };
}

export function createEnvironmentReport(): EnvironmentReport {
  const tools: ToolCheck[] = [
    buildToolCheck("gh", true),
    buildToolCheck("git", true),
    buildToolCheck("sqlite3", false),
    buildToolCheck("glab", false),
  ];

  return {
    runtime: {
      bunVersion: process.versions.bun ?? null,
      nodeVersion: process.versions.node ?? null,
    },
    tools,
  };
}

// --- Workspace health check ---

export type WorkspaceHealthReport = {
  readonly databaseAccessible: boolean;
  readonly divergences: readonly DivergenceEntry[];
  readonly staleSteps: readonly StaleStepInfo[];
};

export async function checkWorkspaceHealth(
  config: ResolvedPluginConfig,
): Promise<WorkspaceHealthReport> {
  let databaseAccessible = false;

  try {
    getDatabasePragmas(config.paths.database);
    databaseAccessible = true;
  } catch {
    return {
      databaseAccessible: false,
      divergences: [],
      staleSteps: [],
    };
  }

  const divergenceReport = await detectProgressDivergence(
    config.paths.database,
    config.paths.progressDirectory,
    config.workspaceRoot,
  );

  const staleSteps = detectAllStaleSteps(config.paths.database);

  return {
    databaseAccessible,
    divergences: divergenceReport.divergences,
    staleSteps,
  };
}
