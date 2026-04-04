import { describe, expect, it } from "vitest";

import {
  type ExternalCommandFailureReason,
  classifyExternalCommandError,
} from "../../src/exploratory-testing/lib/execa-error";

describe("classifyExternalCommandError", () => {
  it("classifies a timeout error", () => {
    const reason = classifyExternalCommandError({
      timedOut: true,
      shortMessage: "Command timed out after 30000 milliseconds",
    });

    expect(reason).toBe("timeout");
  });

  it("classifies a command-not-found error (exit code 127)", () => {
    const reason = classifyExternalCommandError({
      exitCode: 127,
      stderr: "gh: command not found",
    });

    expect(reason).toBe("command-not-found");
  });

  it("classifies a command-not-found error via ENOENT", () => {
    const reason = classifyExternalCommandError({
      message: "spawn gh ENOENT",
    });

    expect(reason).toBe("command-not-found");
  });

  it("classifies an authentication error from gh", () => {
    const reason = classifyExternalCommandError({
      exitCode: 4,
      stderr:
        "gh: To use GitHub CLI in a non-interactive context, set the GH_TOKEN environment variable.",
    });

    expect(reason).toBe("auth-failure");
  });

  it("classifies an authentication error from glab", () => {
    const reason = classifyExternalCommandError({
      exitCode: 1,
      stderr: "glab auth login",
    });

    expect(reason).toBe("auth-failure");
  });

  it("classifies a network error via stderr keywords", () => {
    const reason = classifyExternalCommandError({
      exitCode: 1,
      stderr: "Could not resolve host: github.com",
    });

    expect(reason).toBe("network");
  });

  it("classifies SSL/TLS errors as network", () => {
    const reason = classifyExternalCommandError({
      exitCode: 1,
      stderr: "SSL certificate problem: unable to get local issuer certificate",
    });

    expect(reason).toBe("network");
  });

  it("classifies connection refused as network", () => {
    const reason = classifyExternalCommandError({
      exitCode: 1,
      stderr: "Failed to connect to github.com port 443: Connection refused",
    });

    expect(reason).toBe("network");
  });

  it("falls back to unknown for unrecognized errors", () => {
    const reason = classifyExternalCommandError({
      exitCode: 1,
      stderr: "Something unexpected happened",
    });

    expect(reason).toBe("unknown");
  });

  it("falls back to unknown for non-object errors", () => {
    const reason = classifyExternalCommandError("string error");

    expect(reason).toBe("unknown");
  });

  it("falls back to unknown for null", () => {
    const reason = classifyExternalCommandError(null);

    expect(reason).toBe("unknown");
  });
});
