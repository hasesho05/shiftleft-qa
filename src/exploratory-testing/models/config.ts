import { nonEmptyString, schema, v } from "../lib/validation";

export const scmProviderSchema = schema(
  v.picklist(["auto", "github", "gitlab"]),
);
export const resolvedScmProviderSchema = schema(
  v.picklist(["github", "gitlab"]),
);
export const defaultLanguageSchema = schema(v.picklist(["ja", "en"]));

export const pluginConfigPathsSchema = schema(
  v.object({
    database: nonEmptyString(),
    progressDirectory: nonEmptyString(),
    progressSummary: nonEmptyString(),
    artifactsDirectory: nonEmptyString(),
  }),
);

export const publishModeSchema = schema(
  v.picklist(["create", "update", "create-or-update"]),
);

export const publishDefaultsSchema = schema(
  v.object({
    repository: v.optional(nonEmptyString()),
    titlePrefix: v.optional(nonEmptyString()),
    labels: v.optional(v.array(nonEmptyString())),
    assignees: v.optional(v.array(nonEmptyString())),
    findingsComment: v.optional(v.boolean()),
    mode: v.optional(publishModeSchema),
  }),
);

export const pluginConfigSchema = schema(
  v.object({
    version: v.literal(1),
    repositoryRoot: nonEmptyString(),
    scmProvider: scmProviderSchema,
    defaultLanguage: defaultLanguageSchema,
    paths: pluginConfigPathsSchema,
    publishDefaults: publishDefaultsSchema,
  }),
);

export const partialPluginConfigSchema = schema(
  v.object({
    version: v.optional(v.literal(1)),
    repositoryRoot: v.optional(nonEmptyString()),
    scmProvider: v.optional(scmProviderSchema),
    defaultLanguage: v.optional(defaultLanguageSchema),
    paths: v.optional(v.partial(pluginConfigPathsSchema)),
    publishDefaults: v.optional(v.partial(publishDefaultsSchema)),
  }),
);

export type PluginConfig = v.InferOutput<typeof pluginConfigSchema>;
export type PartialPluginConfig = v.InferOutput<
  typeof partialPluginConfigSchema
>;

export type ResolvedPluginConfig = {
  readonly configPath: string;
  readonly configDirectory: string;
  readonly workspaceRoot: string;
  readonly version: PluginConfig["version"];
  readonly repositoryRoot: PluginConfig["repositoryRoot"];
  readonly scmProvider: PluginConfig["scmProvider"];
  readonly defaultLanguage: PluginConfig["defaultLanguage"];
  readonly relativePaths: PluginConfig["paths"];
  readonly publishDefaults: PluginConfig["publishDefaults"];
  readonly paths: {
    readonly database: string;
    readonly progressDirectory: string;
    readonly progressSummary: string;
    readonly artifactsDirectory: string;
  };
};
