import type { z } from "zod";

import { scmProviderSchema } from "../models/config";

const resolvedProviderSchema = scmProviderSchema.exclude(["auto"]);

export type ResolvedScmProvider = z.infer<typeof resolvedProviderSchema>;

export function detectScmProvider(
  remoteUrl: string,
): ResolvedScmProvider | null {
  if (remoteUrl.includes("github.com")) {
    return "github";
  }
  if (remoteUrl.includes("gitlab.com")) {
    return "gitlab";
  }
  return null;
}

export function resolveScmProvider(
  configured: string,
  remoteUrl: string,
): ResolvedScmProvider {
  if (configured !== "auto") {
    const parsed = resolvedProviderSchema.safeParse(configured);
    if (!parsed.success) {
      throw new Error(
        `Unsupported SCM provider: "${configured}". Supported: github, gitlab.`,
      );
    }
    return parsed.data;
  }

  const detected = detectScmProvider(remoteUrl);
  if (!detected) {
    throw new Error(
      `Cannot detect SCM provider from remote URL: ${remoteUrl}. Set scmProvider explicitly in config.json.`,
    );
  }

  return detected;
}
