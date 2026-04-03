import { describe, expect, it } from "vitest";

import {
  buildGitlabPrMetadata,
  countDiffStats,
  extractRepositoryFromWebUrl,
  parseGlabCloseIssuesJson,
  parseGlabDiffsJson,
  parseGlabDiscussionsJson,
  parseGlabMrJson,
} from "../../src/exploratory-testing/scm/gitlab";

describe("parseGlabMrJson", () => {
  it("parses glab mr view JSON output", () => {
    const json = {
      iid: 42,
      title: "Add feature X",
      description: "Description here",
      author: { username: "alice" },
      target_branch: "main",
      source_branch: "feature/x",
      sha: "abc1234",
      project_id: 99,
      web_url: "https://gitlab.com/owner/repo/-/merge_requests/42",
    };

    const result = parseGlabMrJson(json);

    expect(result.prNumber).toBe(42);
    expect(result.title).toBe("Add feature X");
    expect(result.description).toBe("Description here");
    expect(result.author).toBe("alice");
    expect(result.baseBranch).toBe("main");
    expect(result.headBranch).toBe("feature/x");
    expect(result.headSha).toBe("abc1234");
    expect(result.projectId).toBe(99);
    expect(result.webUrl).toBe(
      "https://gitlab.com/owner/repo/-/merge_requests/42",
    );
  });

  it("handles empty description", () => {
    const json = {
      iid: 1,
      title: "Fix",
      description: "",
      author: { username: "alice" },
      target_branch: "main",
      source_branch: "fix/bug",
      sha: "def5678",
      project_id: 99,
      web_url: "https://gitlab.com/owner/repo/-/merge_requests/1",
    };

    const result = parseGlabMrJson(json);

    expect(result.description).toBe("");
  });

  it("handles null description", () => {
    const json = {
      iid: 1,
      title: "Fix",
      description: null,
      author: { username: "alice" },
      target_branch: "main",
      source_branch: "fix/bug",
      sha: "def5678",
      project_id: 99,
      web_url: "https://gitlab.com/owner/repo/-/merge_requests/1",
    };

    const result = parseGlabMrJson(json);

    expect(result.description).toBe("");
  });

  it("parses Discussions from glab mr view --comments output", () => {
    const json = {
      iid: 42,
      title: "Add feature X",
      description: "Description here",
      author: { username: "alice" },
      target_branch: "main",
      source_branch: "feature/x",
      sha: "abc1234",
      project_id: 99,
      web_url: "https://gitlab.com/owner/repo/-/merge_requests/42",
      Discussions: [
        {
          notes: [
            {
              author: { username: "bob" },
              body: "Looks good",
              created_at: "2026-04-01T00:00:00Z",
            },
          ],
        },
      ],
    };

    const result = parseGlabMrJson(json);

    expect(result.discussions).toHaveLength(1);
  });

  it("defaults discussions to empty array when absent", () => {
    const json = {
      iid: 1,
      title: "Fix",
      description: "",
      author: { username: "alice" },
      target_branch: "main",
      source_branch: "fix/bug",
      sha: "def5678",
      project_id: 99,
      web_url: "https://gitlab.com/owner/repo/-/merge_requests/1",
    };

    const result = parseGlabMrJson(json);

    expect(result.discussions).toEqual([]);
  });
});

describe("parseGlabDiffsJson", () => {
  it("parses diff entries with status detection", () => {
    const json = [
      {
        old_path: "src/index.ts",
        new_path: "src/index.ts",
        new_file: false,
        renamed_file: false,
        deleted_file: false,
        diff: "@@ -1,3 +1,5 @@\n context\n+added1\n+added2\n context\n-removed\n",
      },
      {
        old_path: "src/new.ts",
        new_path: "src/new.ts",
        new_file: true,
        renamed_file: false,
        deleted_file: false,
        diff: "@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3\n",
      },
      {
        old_path: "src/old.ts",
        new_path: "src/old.ts",
        new_file: false,
        renamed_file: false,
        deleted_file: true,
        diff: "@@ -1,2 +0,0 @@\n-line1\n-line2\n",
      },
      {
        old_path: "src/original.ts",
        new_path: "src/renamed.ts",
        new_file: false,
        renamed_file: true,
        deleted_file: false,
        diff: "",
      },
    ];

    const result = parseGlabDiffsJson(json);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      path: "src/index.ts",
      status: "modified",
      additions: 2,
      deletions: 1,
      previousPath: null,
    });
    expect(result[1]?.status).toBe("added");
    expect(result[1]?.additions).toBe(3);
    expect(result[1]?.deletions).toBe(0);
    expect(result[2]?.status).toBe("deleted");
    expect(result[2]?.additions).toBe(0);
    expect(result[2]?.deletions).toBe(2);
    expect(result[3]?.status).toBe("renamed");
    expect(result[3]?.previousPath).toBe("src/original.ts");
  });

  it("uses old_path for deleted files when new_path is empty", () => {
    const json = [
      {
        old_path: "src/removed.ts",
        new_path: "",
        new_file: false,
        renamed_file: false,
        deleted_file: true,
        diff: "@@ -1,2 +0,0 @@\n-line1\n-line2\n",
      },
    ];

    const result = parseGlabDiffsJson(json);

    expect(result[0]?.path).toBe("src/removed.ts");
    expect(result[0]?.status).toBe("deleted");
  });

  it("handles empty diff array", () => {
    const result = parseGlabDiffsJson([]);

    expect(result).toEqual([]);
  });
});

describe("countDiffStats", () => {
  it("counts additions and deletions from unified diff", () => {
    const diff =
      "@@ -1,3 +1,5 @@\n context\n+added1\n+added2\n context\n-removed\n";

    const result = countDiffStats(diff);

    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
  });

  it("returns zeros for empty diff", () => {
    const result = countDiffStats("");

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it("ignores --- and +++ header lines", () => {
    const diff =
      "--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n";

    const result = countDiffStats(diff);

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
  });
});

describe("parseGlabCloseIssuesJson", () => {
  it("extracts issue iids as strings", () => {
    const json = [
      { iid: 10, title: "Bug fix" },
      { iid: 20, title: "Feature request" },
    ];

    const result = parseGlabCloseIssuesJson(json);

    expect(result).toEqual(["#10", "#20"]);
  });

  it("returns empty array for no closing issues", () => {
    const result = parseGlabCloseIssuesJson([]);

    expect(result).toEqual([]);
  });
});

describe("parseGlabDiscussionsJson", () => {
  it("extracts review comments from discussions", () => {
    const discussions = [
      {
        notes: [
          {
            author: { username: "bob" },
            body: "Looks good",
            created_at: "2026-04-01T00:00:00Z",
          },
        ],
      },
      {
        notes: [
          {
            author: { username: "carol" },
            body: "Needs work",
            created_at: "2026-04-01T01:00:00Z",
          },
          {
            author: { username: "alice" },
            body: "Fixed",
            created_at: "2026-04-01T02:00:00Z",
          },
        ],
      },
    ];

    const result = parseGlabDiscussionsJson(discussions);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      author: "bob",
      body: "Looks good",
      path: null,
      createdAt: "2026-04-01T00:00:00Z",
    });
    expect(result[2]?.author).toBe("alice");
  });

  it("filters out empty body notes", () => {
    const discussions = [
      {
        notes: [
          {
            author: { username: "bob" },
            body: "Good",
            created_at: "2026-04-01T00:00:00Z",
          },
          {
            author: { username: "carol" },
            body: "",
            created_at: "2026-04-01T01:00:00Z",
          },
          {
            author: { username: "dave" },
            body: "   ",
            created_at: "2026-04-01T02:00:00Z",
          },
        ],
      },
    ];

    const result = parseGlabDiscussionsJson(discussions);

    expect(result).toHaveLength(1);
    expect(result[0]?.author).toBe("bob");
  });

  it("returns empty array for empty discussions", () => {
    const result = parseGlabDiscussionsJson([]);

    expect(result).toEqual([]);
  });
});

describe("extractRepositoryFromWebUrl", () => {
  it("extracts owner/repo from GitLab MR web URL", () => {
    const result = extractRepositoryFromWebUrl(
      "https://gitlab.com/owner/repo/-/merge_requests/42",
    );

    expect(result).toBe("owner/repo");
  });

  it("handles nested group paths", () => {
    const result = extractRepositoryFromWebUrl(
      "https://gitlab.com/group/subgroup/project/-/merge_requests/1",
    );

    expect(result).toBe("group/subgroup/project");
  });

  it("handles self-hosted GitLab URLs", () => {
    const result = extractRepositoryFromWebUrl(
      "https://gitlab.example.com/team/project/-/merge_requests/5",
    );

    expect(result).toBe("team/project");
  });

  it("throws on invalid URL format", () => {
    expect(() => extractRepositoryFromWebUrl("not-a-url")).toThrow(
      /Cannot extract repository/,
    );
  });
});

describe("buildGitlabPrMetadata", () => {
  it("combines parsed data into PrMetadata with gitlab provider", () => {
    const mrData = {
      prNumber: 42,
      title: "Add feature X",
      description: "Implements feature X",
      author: "alice",
      baseBranch: "main",
      headBranch: "feature/x",
      headSha: "abc1234",
      projectId: 99,
      webUrl: "https://gitlab.com/owner/repo/-/merge_requests/42",
      discussions: [],
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
    const linkedIssues = ["#10"];

    const result = buildGitlabPrMetadata(mrData, files, comments, linkedIssues);

    expect(result.provider).toBe("gitlab");
    expect(result.repository).toBe("owner/repo");
    expect(result.prNumber).toBe(42);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.reviewComments).toHaveLength(1);
    expect(result.linkedIssues).toEqual(["#10"]);
    expect(result.fetchedAt).toBeDefined();
  });
});
