import { describe, expect, it } from "vitest";

import { readPluginManifest } from "../../src/exploratory-testing/tools/manifest";

describe("readPluginManifest", () => {
  it("loads and validates the plugin manifest", async () => {
    const manifest = await readPluginManifest();

    expect(manifest.name).toBe("exploratory-testing-plugin");
    expect(manifest.skills.length).toBeGreaterThan(0);
    expect(
      manifest.skills.some((skill) => skill.name === "generate-charters"),
    ).toBe(true);
  });
});
