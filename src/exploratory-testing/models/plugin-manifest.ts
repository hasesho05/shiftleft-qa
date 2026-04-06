import { nonEmptyString, schema, v } from "../lib/validation";

export const pluginManifestSchema = schema(
  v.object({
    name: nonEmptyString(),
    version: nonEmptyString(),
    description: nonEmptyString(),
    author: v.optional(
      v.object({
        name: nonEmptyString(),
        url: v.optional(nonEmptyString()),
      }),
    ),
    repository: v.optional(nonEmptyString()),
    license: v.optional(nonEmptyString()),
    keywords: v.optional(v.array(nonEmptyString())),
    homepage: v.optional(nonEmptyString()),
    docs: v.optional(nonEmptyString()),
    support: v.optional(
      v.object({
        url: nonEmptyString(),
      }),
    ),
  }),
);
export type PluginManifest = v.InferOutput<typeof pluginManifestSchema>;
