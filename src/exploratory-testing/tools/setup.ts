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

export type DatabaseInitializationResult = {
  readonly config: ResolvedPluginConfig;
  readonly createdConfig: boolean;
  readonly databasePath: string;
  readonly journalMode: string;
  readonly foreignKeys: number;
};

export type WorkspaceSetupResult = DatabaseInitializationResult;

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

  return {
    ...database,
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
