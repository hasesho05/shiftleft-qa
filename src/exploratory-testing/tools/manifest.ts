import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type PluginManifest,
  pluginManifestSchema,
} from "../models/plugin-manifest";

export async function readPluginManifest(
  manifestPath = ".claude-plugin/plugin.json",
): Promise<PluginManifest> {
  const absolutePath = resolve(manifestPath);
  const contents = await readFile(absolutePath, "utf8");
  const rawManifest: unknown = JSON.parse(contents);

  return pluginManifestSchema.parse(rawManifest);
}
