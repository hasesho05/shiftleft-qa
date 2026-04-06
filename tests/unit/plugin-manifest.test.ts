import { describe, expect, it } from "vitest";

import { readPluginManifest } from "../../src/exploratory-testing/tools/manifest";

describe("readPluginManifest", () => {
  it("loads and validates the plugin manifest", async () => {
    const manifest = await readPluginManifest();

    expect(manifest.name).toBe("shiftleft-qa");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.description).toContain("GitHub QA handoff");
  });
});
