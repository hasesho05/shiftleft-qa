import { mkdir } from "node:fs/promises";
import { relative } from "node:path";

import {
  getDatabasePragmas,
  initializeWorkspaceDatabase,
  saveWorkspaceState,
} from "../db/workspace-repository";
import type { ResolvedPluginConfig } from "../models/config";
import {
  type EnsuredPluginConfig,
  ensurePluginConfig,
  readPluginConfig,
} from "./config";
import { writeStepHandoverFromConfig } from "./progress";

export type DatabaseInitializationResult = {
  readonly config: ResolvedPluginConfig;
  readonly createdConfig: boolean;
  readonly databasePath: string;
  readonly journalMode: string;
  readonly foreignKeys: number;
};

export type WorkspaceSetupResult = DatabaseInitializationResult & {
  readonly progressDirectory: string;
  readonly progressSummaryPath: string;
  readonly artifactsDirectory: string;
  readonly setupProgressPath: string;
  readonly currentStep: string | null;
};

export async function initializeDatabaseFromConfig(
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
): Promise<DatabaseInitializationResult> {
  const ensured = await ensurePluginConfig(configPath, manifestPath);
  const result = await initializeDatabaseFromEnsuredConfig(ensured);

  return result;
}

export async function initializeWorkspace(
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
): Promise<WorkspaceSetupResult> {
  const ensured = await ensurePluginConfig(configPath, manifestPath);
  const database = await initializeDatabaseFromEnsuredConfig(ensured);

  await mkdir(database.config.paths.progressDirectory, { recursive: true });
  await mkdir(database.config.paths.artifactsDirectory, { recursive: true });

  const setupProgress = await writeStepHandoverFromConfig(database.config, {
    stepName: "setup",
    status: "completed",
    summary: "Workspace state initialized for exploratory testing.",
    nextStep: "pr-intake",
    body: [
      "# Workspace setup",
      "",
      "## Summary",
      "",
      "- Created or validated `config.json`.",
      "- Initialized the SQLite workspace database.",
      "- Ensured the progress and output directories exist.",
      "",
      "## Next step",
      "",
      "- pr-intake",
      "",
    ].join("\n"),
  });

  return {
    ...database,
    progressDirectory: database.config.paths.progressDirectory,
    progressSummaryPath: database.config.paths.progressSummary,
    artifactsDirectory: database.config.paths.artifactsDirectory,
    setupProgressPath: setupProgress.filePath,
    currentStep: "pr-intake",
  };
}

export async function loadConfiguredWorkspace(
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
): Promise<ResolvedPluginConfig> {
  return readPluginConfig(configPath, manifestPath);
}

async function initializeDatabaseFromEnsuredConfig(
  ensured: EnsuredPluginConfig,
): Promise<DatabaseInitializationResult> {
  initializeWorkspaceDatabase(ensured.config.paths.database);
  saveWorkspaceState(ensured.config.paths.database, {
    configPath: relative(
      ensured.config.workspaceRoot,
      ensured.config.configPath,
    ),
    repositoryRoot: ensured.config.repositoryRoot,
    databasePath: ensured.config.relativePaths.database,
    progressDirectory: ensured.config.relativePaths.progressDirectory,
    progressSummaryPath: ensured.config.relativePaths.progressSummary,
    artifactsDirectory: ensured.config.relativePaths.artifactsDirectory,
    scmProvider: ensured.config.scmProvider,
    defaultLanguage: ensured.config.defaultLanguage,
  });

  const pragmas = getDatabasePragmas(ensured.config.paths.database);

  return {
    config: ensured.config,
    createdConfig: ensured.created,
    databasePath: ensured.config.paths.database,
    journalMode: pragmas.journalMode,
    foreignKeys: pragmas.foreignKeys,
  };
}
