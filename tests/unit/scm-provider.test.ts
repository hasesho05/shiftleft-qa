import { describe, expect, it } from "vitest";

import {
  detectScmProvider,
  resolveScmProvider,
} from "../../src/exploratory-testing/scm/detect-provider";

describe("detectScmProvider", () => {
  it("detects github from remote URL containing github.com", () => {
    const result = detectScmProvider("https://github.com/owner/repo.git");

    expect(result).toBe("github");
  });

  it("detects github from SSH remote URL", () => {
    const result = detectScmProvider("git@github.com:owner/repo.git");

    expect(result).toBe("github");
  });

  it("detects gitlab from remote URL containing gitlab.com", () => {
    const result = detectScmProvider("https://gitlab.com/owner/repo.git");

    expect(result).toBe("gitlab");
  });

  it("detects gitlab from SSH remote URL", () => {
    const result = detectScmProvider("git@gitlab.com:owner/repo.git");

    expect(result).toBe("gitlab");
  });

  it("returns null for unrecognized remote URL", () => {
    const result = detectScmProvider("https://bitbucket.org/owner/repo.git");

    expect(result).toBeNull();
  });
});

describe("resolveScmProvider", () => {
  it("returns explicit provider when not auto", () => {
    const result = resolveScmProvider("github", "https://gitlab.com/a/b.git");

    expect(result).toBe("github");
  });

  it("resolves auto to detected provider", () => {
    const result = resolveScmProvider(
      "auto",
      "https://github.com/owner/repo.git",
    );

    expect(result).toBe("github");
  });

  it("throws when auto and provider cannot be detected", () => {
    expect(() =>
      resolveScmProvider("auto", "https://bitbucket.org/a/b.git"),
    ).toThrow(/Cannot detect SCM provider/);
  });

  it("throws when explicit provider is unsupported", () => {
    expect(() =>
      resolveScmProvider("bitbucket", "https://bitbucket.org/a/b.git"),
    ).toThrow(/Unsupported SCM provider/);
  });
});
