import { describe, expect, it } from "vitest";

import { normalizeGhCommandError } from "../../src/exploratory-testing/scm/fetch-github";
import { normalizeExternalCommandError } from "../../src/exploratory-testing/scm/fetch-pr";

describe("SCM command error normalization", () => {
  it("includes git context and timeout information", () => {
    const message = normalizeExternalCommandError(
      {
        timedOut: true,
        shortMessage: "Command timed out",
      },
      {
        command: "git",
        args: ["remote", "get-url", "origin"],
        cwd: "/repo",
        timeoutMs: 30_000,
      },
    );

    expect(message).toContain("git remote get-url origin の実行に失敗しました");
    expect(message).toContain("30000ms でタイムアウトしました");
  });

  it("includes gh context and exit code information", () => {
    const message = normalizeGhCommandError(
      {
        exitCode: 1,
        stderr: "Not a git repository",
      },
      {
        args: ["pr", "view", "42"],
        cwd: "/repo",
        timeoutMs: 30_000,
      },
    );

    expect(message).toContain("gh pr view 42 の実行に失敗しました");
    expect(message).toContain("終了コード 1");
    expect(message).toContain("Not a git repository");
  });
});
