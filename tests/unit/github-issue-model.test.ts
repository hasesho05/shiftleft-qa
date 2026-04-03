import { describe, expect, it } from "vitest";

import {
  createdCommentSchema,
  createdIssueSchema,
} from "../../src/exploratory-testing/models/github-issue";

describe("createdIssueSchema", () => {
  it("parses valid gh issue create --json output", () => {
    const json = {
      number: 123,
      url: "https://github.com/owner/repo/issues/123",
      title: "QA: PR #42 — feature X",
    };

    const result = createdIssueSchema.parse(json);

    expect(result.number).toBe(123);
    expect(result.url).toBe("https://github.com/owner/repo/issues/123");
    expect(result.title).toBe("QA: PR #42 — feature X");
  });

  it("rejects missing number", () => {
    const json = {
      url: "https://github.com/owner/repo/issues/123",
      title: "QA handoff",
    };

    expect(() => createdIssueSchema.parse(json)).toThrow();
  });

  it("rejects empty url", () => {
    const json = {
      number: 1,
      url: "",
      title: "QA handoff",
    };

    expect(() => createdIssueSchema.parse(json)).toThrow();
  });

  it("rejects empty title", () => {
    const json = {
      number: 1,
      url: "https://github.com/owner/repo/issues/1",
      title: "",
    };

    expect(() => createdIssueSchema.parse(json)).toThrow();
  });

  it("rejects non-positive number", () => {
    const json = {
      number: 0,
      url: "https://github.com/owner/repo/issues/0",
      title: "QA handoff",
    };

    expect(() => createdIssueSchema.parse(json)).toThrow();
  });
});

describe("createdCommentSchema", () => {
  it("parses valid gh issue comment --json output", () => {
    const json = {
      url: "https://github.com/owner/repo/issues/123#issuecomment-456",
    };

    const result = createdCommentSchema.parse(json);

    expect(result.url).toBe(
      "https://github.com/owner/repo/issues/123#issuecomment-456",
    );
  });

  it("rejects empty url", () => {
    const json = { url: "" };

    expect(() => createdCommentSchema.parse(json)).toThrow();
  });

  it("rejects missing url", () => {
    const json = {};

    expect(() => createdCommentSchema.parse(json)).toThrow();
  });
});
