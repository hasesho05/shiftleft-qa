import { describe, expect, it } from "vitest";

import {
  type ToolCheck,
  createEnvironmentReport,
} from "../../src/exploratory-testing/tools/doctor";

describe("doctor spawnSync timeout", () => {
  it("completes within a reasonable time even if a tool hangs", () => {
    const start = Date.now();
    const report = createEnvironmentReport();
    const elapsed = Date.now() - start;

    // Should complete within 15 seconds even with all tool checks
    expect(elapsed).toBeLessThan(15_000);
    expect(report.tools.length).toBeGreaterThan(0);
  });

  it("detects tool availability with timeout protection", () => {
    const report = createEnvironmentReport();

    for (const tool of report.tools) {
      // Each tool should have a boolean detected field
      expect(typeof tool.detected).toBe("boolean");
      // Version should be string or null
      expect(tool.version === null || typeof tool.version === "string").toBe(
        true,
      );
    }
  });
});
