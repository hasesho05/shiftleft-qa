import { describe, expect, it } from "vitest";

import {
  buildPrMetadata,
  parseGhPrCommentsJson,
  parseGhPrFilesJson,
  parseGhPrJson,
} from "../../src/exploratory-testing/scm/github";

describe("parseGhPrJson", () => {
  it("parses gh pr view JSON output", () => {
    const json = {
      number: 42,
      title: "Add feature X",
      body: "Description here",
      author: { login: "alice" },
      baseRefName: "main",
      headRefName: "feature/x",
      headRefOid: "abc1234",
      closingIssuesReferences: {
        nodes: [{ number: 10 }],
      },
    };

    const result = parseGhPrJson(json);

    expect(result.prNumber).toBe(42);
    expect(result.title).toBe("Add feature X");
    expect(result.description).toBe("Description here");
    expect(result.author).toBe("alice");
    expect(result.baseBranch).toBe("main");
    expect(result.headBranch).toBe("feature/x");
    expect(result.headSha).toBe("abc1234");
    expect(result.linkedIssues).toEqual(["#10"]);
  });

  it("handles null body", () => {
    const json = {
      number: 1,
      title: "Fix",
      body: null,
      author: { login: "alice" },
      baseRefName: "main",
      headRefName: "fix/bug",
      headRefOid: "def5678",
      closingIssuesReferences: { nodes: [] },
    };

    const result = parseGhPrJson(json);

    expect(result.description).toBe("");
  });

  it("handles missing closingIssuesReferences", () => {
    const json = {
      number: 1,
      title: "Fix",
      body: "",
      author: { login: "alice" },
      baseRefName: "main",
      headRefName: "fix/bug",
      headRefOid: "def5678",
    };

    const result = parseGhPrJson(json);

    expect(result.linkedIssues).toEqual([]);
  });
});

describe("parseGhPrFilesJson", () => {
  it("parses changed files with status mapping", () => {
    const json = [
      { path: "src/index.ts", additions: 10, deletions: 2, status: "MODIFIED" },
      { path: "src/new.ts", additions: 50, deletions: 0, status: "ADDED" },
      { path: "src/old.ts", additions: 0, deletions: 30, status: "REMOVED" },
      {
        path: "src/renamed.ts",
        additions: 0,
        deletions: 0,
        status: "RENAMED",
        previousFilename: "src/original.ts",
      },
    ];

    const result = parseGhPrFilesJson(json);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      path: "src/index.ts",
      status: "modified",
      additions: 10,
      deletions: 2,
      previousPath: null,
    });
    expect(result[1]?.status).toBe("added");
    expect(result[2]?.status).toBe("deleted");
    expect(result[3]?.status).toBe("renamed");
    expect(result[3]?.previousPath).toBe("src/original.ts");
  });

  it("throws on unknown file status", () => {
    const json = [
      {
        path: "src/x.ts",
        additions: 0,
        deletions: 0,
        status: "UNKNOWN_STATUS",
      },
    ];

    expect(() => parseGhPrFilesJson(json)).toThrow(
      /Unknown GitHub file status/,
    );
  });
});

describe("parseGhPrCommentsJson", () => {
  it("parses review comments", () => {
    const json = [
      {
        author: { login: "bob" },
        body: "Looks good",
        submittedAt: "2026-04-01T00:00:00Z",
      },
      {
        author: { login: "carol" },
        body: "General comment",
        submittedAt: "2026-04-01T01:00:00Z",
      },
    ];

    const result = parseGhPrCommentsJson(json);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      author: "bob",
      body: "Looks good",
      path: null,
      createdAt: "2026-04-01T00:00:00Z",
    });
  });

  it("filters out empty review comments", () => {
    const json = [
      {
        author: { login: "bob" },
        body: "Looks good",
        submittedAt: "2026-04-01T00:00:00Z",
      },
      {
        author: { login: "carol" },
        body: "",
        submittedAt: "2026-04-01T01:00:00Z",
      },
      {
        author: { login: "dave" },
        body: "   ",
        submittedAt: "2026-04-01T02:00:00Z",
      },
    ];

    const result = parseGhPrCommentsJson(json);

    expect(result).toHaveLength(1);
    expect(result[0]?.author).toBe("bob");
  });
});

describe("buildPrMetadata", () => {
  it("combines parsed data into PrMetadata", () => {
    const prData = {
      prNumber: 42,
      title: "Add feature X",
      description: "Implements feature X",
      author: "alice",
      baseBranch: "main",
      headBranch: "feature/x",
      headSha: "abc1234",
      linkedIssues: ["#10"],
    };
    const files = [
      {
        path: "src/index.ts",
        status: "modified" as const,
        additions: 10,
        deletions: 2,
        previousPath: null,
      },
    ];
    const comments = [
      {
        author: "bob",
        body: "LGTM",
        path: null,
        createdAt: "2026-04-01T00:00:00Z",
      },
    ];

    const result = buildPrMetadata("owner/repo", prData, files, comments);

    expect(result.provider).toBe("github");
    expect(result.repository).toBe("owner/repo");
    expect(result.prNumber).toBe(42);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.reviewComments).toHaveLength(1);
    expect(result.fetchedAt).toBeDefined();
  });
});
