import { describe, expect, it } from "vitest";

import {
  type NormalizedExternalCommandError,
  normalizeExecaErrorWithReason,
} from "../../src/exploratory-testing/lib/execa-error";

describe("normalizeExecaErrorWithReason", () => {
  it("returns structured error with timeout reason", () => {
    const result = normalizeExecaErrorWithReason(
      { timedOut: true, shortMessage: "Command timed out" },
      {
        command: "gh",
        args: ["pr", "view", "1"],
        cwd: "/repo",
        timeoutMs: 30_000,
      },
    );

    expect(result.reason).toBe("timeout");
    expect(result.message).toContain("gh pr view 1");
    expect(result.message).toContain("タイムアウト");
  });

  it("returns structured error with auth-failure reason", () => {
    const result = normalizeExecaErrorWithReason(
      { exitCode: 4, stderr: "set the GH_TOKEN environment variable" },
      { command: "gh", args: ["pr", "view"], cwd: "/repo", timeoutMs: 30_000 },
    );

    expect(result.reason).toBe("auth-failure");
    expect(result.message).toContain("gh pr view");
  });

  it("returns structured error with command-not-found reason", () => {
    const result = normalizeExecaErrorWithReason(
      { message: "spawn glab ENOENT" },
      {
        command: "glab",
        args: ["mr", "view"],
        cwd: "/repo",
        timeoutMs: 30_000,
      },
    );

    expect(result.reason).toBe("command-not-found");
    expect(result.message).toContain("glab mr view");
  });

  it("returns structured error with network reason", () => {
    const result = normalizeExecaErrorWithReason(
      { exitCode: 1, stderr: "Could not resolve host: github.com" },
      { command: "gh", args: ["pr", "view"], cwd: "/repo", timeoutMs: 30_000 },
    );

    expect(result.reason).toBe("network");
  });

  it("returns unknown reason for unrecognized errors", () => {
    const result = normalizeExecaErrorWithReason(
      { exitCode: 1, stderr: "unexpected error" },
      { command: "gh", args: ["pr", "view"], cwd: "/repo", timeoutMs: 30_000 },
    );

    expect(result.reason).toBe("unknown");
    expect(result.message).toContain("unexpected error");
  });

  it("works without context", () => {
    const result = normalizeExecaErrorWithReason({
      timedOut: true,
      shortMessage: "timed out",
    });

    expect(result.reason).toBe("timeout");
    expect(result.message).toContain("timed out");
  });
});
