import { nonEmptyString, schema, v } from "../lib/validation";

export const skillManifestSchema = schema(
  v.object({
    name: nonEmptyString(),
    path: nonEmptyString(),
    description: nonEmptyString(),
  }),
);

export const pluginManifestSchema = schema(
  v.object({
    name: nonEmptyString(),
    version: nonEmptyString(),
    description: nonEmptyString(),
    runtime: v.object({
      packageManager: nonEmptyString(),
      entry: nonEmptyString(),
    }),
    state: v.object({
      config: nonEmptyString(),
      database: nonEmptyString(),
    }),
    skills: v.pipe(v.array(skillManifestSchema), v.minLength(1)),
  }),
);

export type SkillManifest = v.InferOutput<typeof skillManifestSchema>;
export type PluginManifest = v.InferOutput<typeof pluginManifestSchema>;
