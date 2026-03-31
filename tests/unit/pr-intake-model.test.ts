import { describe, expect, it } from "vitest";

import {
  type PrMetadata,
  changedFileSchema,
  prMetadataSchema,
  reviewCommentSchema,
} from "../../src/exploratory-testing/models/pr-intake";

function createValidPrMetadata(): PrMetadata {
  return {
    provider: "github",
    repository: "owner/repo",
    prNumber: 42,
    title: "Add feature X",
    description: "Implements feature X for better UX",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/x",
    headSha: "abc1234",
    linkedIssues: ["#10"],
    changedFiles: [
      {
        path: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 2,
        previousPath: null,
      },
    ],
    reviewComments: [
      {
        author: "bob",
        body: "Looks good",
        path: "src/index.ts",
        createdAt: "2026-04-01T00:00:00Z",
      },
    ],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

describe("prMetadataSchema", () => {
  it("accepts valid PR metadata", () => {
    const input = createValidPrMetadata();
    const result = prMetadataSchema.parse(input);

    expect(result.provider).toBe("github");
    expect(result.prNumber).toBe(42);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.reviewComments).toHaveLength(1);
  });

  it("rejects auto as provider", () => {
    const input = { ...createValidPrMetadata(), provider: "auto" };

    expect(() => prMetadataSchema.parse(input)).toThrow();
  });

  it("rejects negative prNumber", () => {
    const input = { ...createValidPrMetadata(), prNumber: -1 };

    expect(() => prMetadataSchema.parse(input)).toThrow();
  });

  it("accepts gitlab as provider", () => {
    const input = { ...createValidPrMetadata(), provider: "gitlab" };
    const result = prMetadataSchema.parse(input);

    expect(result.provider).toBe("gitlab");
  });

  it("accepts empty changedFiles and reviewComments", () => {
    const input = {
      ...createValidPrMetadata(),
      changedFiles: [],
      reviewComments: [],
      linkedIssues: [],
    };
    const result = prMetadataSchema.parse(input);

    expect(result.changedFiles).toHaveLength(0);
    expect(result.reviewComments).toHaveLength(0);
  });
});

describe("changedFileSchema", () => {
  it("accepts renamed file with previousPath", () => {
    const result = changedFileSchema.parse({
      path: "src/new-name.ts",
      status: "renamed",
      additions: 0,
      deletions: 0,
      previousPath: "src/old-name.ts",
    });

    expect(result.previousPath).toBe("src/old-name.ts");
  });

  it("defaults previousPath to null", () => {
    const result = changedFileSchema.parse({
      path: "src/index.ts",
      status: "added",
      additions: 5,
      deletions: 0,
    });

    expect(result.previousPath).toBeNull();
  });
});

describe("reviewCommentSchema", () => {
  it("accepts comment without file path", () => {
    const result = reviewCommentSchema.parse({
      author: "alice",
      body: "General comment",
      createdAt: "2026-04-01T00:00:00Z",
    });

    expect(result.path).toBeNull();
  });
});
