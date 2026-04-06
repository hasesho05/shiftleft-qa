import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  type PluginConfig,
  type ResolvedPluginConfig,
  partialPluginConfigSchema,
  pluginConfigSchema,
} from "../models/config";
import { readPluginManifest } from "./manifest";

export type EnsuredPluginConfig = {
  readonly config: ResolvedPluginConfig;
  readonly rawConfig: PluginConfig;
  readonly created: boolean;
};

export type PluginConfigOverrides = {
  readonly repositoryRoot?: string;
};

const DEFAULT_DATABASE_PATH = "exploratory-testing.db";

export function createDefaultPluginConfig(repositoryRoot = "."): PluginConfig {
  return pluginConfigSchema.parse({
    version: 1,
    repositoryRoot,
    scmProvider: "auto",
    defaultLanguage: "ja",
    paths: {
      database: DEFAULT_DATABASE_PATH,
    },
    publishDefaults: {
      mode: "create-or-update",
    },
  });
}

export async function readPluginConfig(
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
): Promise<ResolvedPluginConfig> {
  const absoluteConfigPath = resolve(configPath);
  await readPluginManifest(manifestPath);

  if (!(await pathExists(absoluteConfigPath))) {
    throw new Error(
      `config ファイルが見つかりません: ${absoluteConfigPath}。config.json を作成するか、bun run dev db init --repository-root <path> を実行してください。`,
    );
  }

  const contents = await readFile(absoluteConfigPath, "utf8");
  const rawConfig: unknown = JSON.parse(contents);
  const config = normalizePluginConfig(rawConfig);

  return resolvePluginConfig(config, absoluteConfigPath);
}

export async function writePluginConfig(
  config: PluginConfig,
  configPath = "config.json",
): Promise<string> {
  const absoluteConfigPath = resolve(configPath);
  await mkdir(dirname(absoluteConfigPath), { recursive: true });
  await writeFile(
    absoluteConfigPath,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );

  return absoluteConfigPath;
}

export async function ensurePluginConfig(
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
  overrides?: PluginConfigOverrides,
): Promise<EnsuredPluginConfig> {
  const absoluteConfigPath = resolve(configPath);
  await readPluginManifest(manifestPath);

  if (!(await pathExists(absoluteConfigPath))) {
    const config = createDefaultPluginConfig(overrides?.repositoryRoot);
    await writePluginConfig(config, absoluteConfigPath);

    return {
      config: resolvePluginConfig(config, absoluteConfigPath),
      rawConfig: config,
      created: true,
    };
  }

  const contents = await readFile(absoluteConfigPath, "utf8");
  const rawConfig: unknown = JSON.parse(contents);
  const config = normalizePluginConfig(rawConfig, overrides);
  await writePluginConfig(config, absoluteConfigPath);

  return {
    config: resolvePluginConfig(config, absoluteConfigPath),
    rawConfig: config,
    created: false,
  };
}

export function resolvePluginConfig(
  config: PluginConfig,
  configPath: string,
): ResolvedPluginConfig {
  const absoluteConfigPath = resolve(configPath);
  const configDirectory = dirname(absoluteConfigPath);
  const workspaceRoot = resolveFromBase(configDirectory, config.repositoryRoot);

  return {
    configPath: absoluteConfigPath,
    configDirectory,
    workspaceRoot,
    version: config.version,
    repositoryRoot: config.repositoryRoot,
    scmProvider: config.scmProvider,
    defaultLanguage: config.defaultLanguage,
    publishDefaults: config.publishDefaults,
    relativePaths: config.paths,
    paths: {
      database: resolveFromBase(workspaceRoot, config.paths.database),
    },
  };
}

function normalizePluginConfig(
  rawConfig: unknown,
  overrides?: PluginConfigOverrides,
): PluginConfig {
  const defaults = createDefaultPluginConfig(overrides?.repositoryRoot);
  const partialConfig = partialPluginConfigSchema.parse(rawConfig);

  return pluginConfigSchema.parse({
    ...defaults,
    ...partialConfig,
    repositoryRoot:
      overrides?.repositoryRoot ??
      partialConfig.repositoryRoot ??
      defaults.repositoryRoot,
    paths: {
      ...defaults.paths,
      ...partialConfig.paths,
    },
    publishDefaults: {
      ...defaults.publishDefaults,
      ...partialConfig.publishDefaults,
    },
  });
}

function resolveFromBase(basePath: string, targetPath: string): string {
  if (isAbsolute(targetPath)) {
    return targetPath;
  }

  return resolve(basePath, targetPath);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
