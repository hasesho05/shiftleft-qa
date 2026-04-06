import { describe, expect, it } from "vitest";

import { readPluginManifest } from "../../src/exploratory-testing/tools/manifest";

describe("readPluginManifest", () => {
  it("loads and validates the plugin manifest", async () => {
    const manifest = await readPluginManifest();

    expect(manifest.name).toBe("shiftleft-qa");
    expect(manifest.skills).toHaveLength(4);
    expect(manifest.skills.some((skill) => skill.name === "capabilities")).toBe(
      true,
    );
    expect(manifest.skills.some((skill) => skill.name === "analyze-pr")).toBe(
      true,
    );
    expect(
      manifest.skills.some((skill) => skill.name === "design-handoff"),
    ).toBe(true);
    expect(
      manifest.skills.some((skill) => skill.name === "publish-handoff"),
    ).toBe(true);
  });
});
