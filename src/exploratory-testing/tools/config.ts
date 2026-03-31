import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  type PluginConfig,
  type ResolvedPluginConfig,
  partialPluginConfigSchema,
  pluginConfigSchema,
} from "../models/config";
import type { PluginManifest, SkillManifest } from "../models/plugin-manifest";
import { readPluginManifest } from "./manifest";

export type EnsuredPluginConfig = {
  readonly config: ResolvedPluginConfig;
  readonly rawConfig: PluginConfig;
  readonly created: boolean;
};

export function createDefaultPluginConfig(
  manifest: PluginManifest,
): PluginConfig {
  return pluginConfigSchema.parse({
    version: 1,
    repositoryRoot: ".",
    scmProvider: "auto",
    defaultLanguage: "ja",
    paths: {
      database: manifest.state.database,
      progressDirectory: manifest.state.progressDirectory,
      progressSummary: join(
        manifest.state.progressDirectory,
        "progress-summary.md",
      ),
      artifactsDirectory: manifest.state.artifactsDirectory,
    },
  });
}

export async function readPluginConfig(
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
): Promise<ResolvedPluginConfig> {
  const absoluteConfigPath = resolve(configPath);
  const manifest = await readPluginManifest(manifestPath);

  if (!(await pathExists(absoluteConfigPath))) {
    throw new Error(
      `Config file not found at ${absoluteConfigPath}. Run exploratory-testing setup first.`,
    );
  }

  const contents = await readFile(absoluteConfigPath, "utf8");
  const rawConfig: unknown = JSON.parse(contents);
  const config = normalizePluginConfig(rawConfig, manifest);

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
): Promise<EnsuredPluginConfig> {
  const absoluteConfigPath = resolve(configPath);
  const manifest = await readPluginManifest(manifestPath);

  if (!(await pathExists(absoluteConfigPath))) {
    const config = createDefaultPluginConfig(manifest);
    await writePluginConfig(config, absoluteConfigPath);

    return {
      config: resolvePluginConfig(config, absoluteConfigPath),
      rawConfig: config,
      created: true,
    };
  }

  const contents = await readFile(absoluteConfigPath, "utf8");
  const rawConfig: unknown = JSON.parse(contents);
  const config = normalizePluginConfig(rawConfig, manifest);
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
    relativePaths: config.paths,
    paths: {
      database: resolveFromBase(workspaceRoot, config.paths.database),
      progressDirectory: resolveFromBase(
        workspaceRoot,
        config.paths.progressDirectory,
      ),
      progressSummary: resolveFromBase(
        workspaceRoot,
        config.paths.progressSummary,
      ),
      artifactsDirectory: resolveFromBase(
        workspaceRoot,
        config.paths.artifactsDirectory,
      ),
    },
  };
}

export function buildManifestSkillsSnapshot(
  skills: readonly SkillManifest[],
): readonly string[] {
  return skills.map((skill) => skill.name);
}

function normalizePluginConfig(
  rawConfig: unknown,
  manifest: PluginManifest,
): PluginConfig {
  const defaults = createDefaultPluginConfig(manifest);
  const partialConfig = partialPluginConfigSchema.parse(rawConfig);

  return pluginConfigSchema.parse({
    ...defaults,
    ...partialConfig,
    paths: {
      ...defaults.paths,
      ...partialConfig.paths,
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
