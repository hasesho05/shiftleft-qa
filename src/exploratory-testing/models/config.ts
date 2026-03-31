import { z } from "zod";

export const scmProviderSchema = z.enum(["auto", "github", "gitlab"]);
export const defaultLanguageSchema = z.enum(["ja", "en"]);

export const pluginConfigPathsSchema = z.object({
  database: z.string().min(1),
  progressDirectory: z.string().min(1),
  progressSummary: z.string().min(1),
  artifactsDirectory: z.string().min(1),
});

export const pluginConfigSchema = z.object({
  version: z.literal(1),
  repositoryRoot: z.string().min(1),
  scmProvider: scmProviderSchema,
  defaultLanguage: defaultLanguageSchema,
  paths: pluginConfigPathsSchema,
});

export const partialPluginConfigSchema = z.object({
  version: z.literal(1).optional(),
  repositoryRoot: z.string().min(1).optional(),
  scmProvider: scmProviderSchema.optional(),
  defaultLanguage: defaultLanguageSchema.optional(),
  paths: pluginConfigPathsSchema.partial().optional(),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;
export type PartialPluginConfig = z.infer<typeof partialPluginConfigSchema>;

export type ResolvedPluginConfig = {
  readonly configPath: string;
  readonly configDirectory: string;
  readonly workspaceRoot: string;
  readonly version: PluginConfig["version"];
  readonly repositoryRoot: PluginConfig["repositoryRoot"];
  readonly scmProvider: PluginConfig["scmProvider"];
  readonly defaultLanguage: PluginConfig["defaultLanguage"];
  readonly relativePaths: PluginConfig["paths"];
  readonly paths: {
    readonly database: string;
    readonly progressDirectory: string;
    readonly progressSummary: string;
    readonly artifactsDirectory: string;
  };
};
