import { z } from "zod";

export const skillManifestSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().min(1),
});

export const pluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  runtime: z.object({
    packageManager: z.string().min(1),
    entry: z.string().min(1),
  }),
  state: z.object({
    config: z.string().min(1),
    database: z.string().min(1),
    progressDirectory: z.string().min(1),
    artifactsDirectory: z.string().min(1),
  }),
  skills: z.array(skillManifestSchema).min(1),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
