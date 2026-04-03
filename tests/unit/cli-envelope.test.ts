import { describe, expect, it } from "vitest";

import {
  formatErrorEnvelope,
  formatSuccessEnvelope,
  normalizeCliErrorMessage,
} from "../../src/exploratory-testing/cli/index";

describe("CLI JSON envelopes", () => {
  it("wraps success payloads in an ok envelope", () => {
    const envelope = formatSuccessEnvelope({
      filePath: "output/report.md",
      status: "completed",
    });

    expect(envelope).toEqual({
      status: "ok",
      data: {
        filePath: "output/report.md",
        status: "completed",
      },
    });
  });

  it("wraps failures in an error envelope", () => {
    const envelope = formatErrorEnvelope(new Error("boom"));

    expect(envelope).toEqual({
      status: "error",
      message: "boom",
    });
  });

  it("normalizes execa-style errors when available", () => {
    const message = normalizeCliErrorMessage({
      shortMessage: "gh pr view failed",
      stderr: "",
      message: "ignored",
    });

    expect(message).toBe("gh pr view failed");
  });
});
