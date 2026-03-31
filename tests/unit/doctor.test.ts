import { describe, expect, it } from "vitest";

import {
  createEnvironmentReport,
  getToolStatus,
} from "../../src/exploratory-testing/tools/doctor";

describe("createEnvironmentReport", () => {
  it("returns runtime information and tool checks", () => {
    const report = createEnvironmentReport();

    expect(report.runtime.nodeVersion?.length ?? 0).toBeGreaterThan(0);
    expect(Array.isArray(report.tools)).toBe(true);
    expect(report.tools.some((tool) => tool.name === "gh")).toBe(true);
    expect(report.tools.some((tool) => tool.name === "git")).toBe(true);
  });

  it("maps detected tools to a status", () => {
    const report = createEnvironmentReport();
    const gh = report.tools.find((tool) => tool.name === "gh");

    expect(gh).toBeDefined();
    if (!gh) {
      throw new Error("Expected gh tool entry to exist");
    }

    expect(getToolStatus(gh)).toMatch(/ok|missing/);
  });
});
