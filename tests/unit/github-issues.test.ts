import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

// Mock node:fs/promises for temp file operations
vi.mock("node:fs/promises", async (importOriginal) => {
  const original =
    (await importOriginal()) as typeof import("node:fs/promises");
  return {
    ...original,
    mkdtemp: vi.fn(async () => "/tmp/gh-issue-body-mock"),
    writeFile: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
  };
});

import { execa } from "execa";

import {
  addIssueComment,
  createIssue,
  editIssueBody,
} from "../../src/exploratory-testing/scm/github-issues";

const execaMock = execa as unknown as Mock;

describe("createIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls gh issue create with correct args and parses output", async () => {
    execaMock.mockResolvedValue({
      stdout: "https://github.com/owner/repo/issues/99\n",
    });

    const result = await createIssue({
      repositoryRoot: "/workspace",
      repository: "owner/repo",
      title: "QA: PR #42",
      body: "## Handoff\n\nTest body",
    });

    expect(execaMock).toHaveBeenCalledOnce();
    const [command, args, options] = execaMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(command).toBe("gh");
    expect(args).toContain("issue");
    expect(args).toContain("create");
    expect(args).toContain("--repo");
    expect(args).toContain("owner/repo");
    expect(args).toContain("--title");
    expect(args).toContain("QA: PR #42");
    expect(args).toContain("--body-file");
    expect(options.cwd).toBe("/workspace");

    expect(result.number).toBe(99);
    expect(result.url).toBe("https://github.com/owner/repo/issues/99");
    expect(result.title).toBe("QA: PR #42");
  });

  it("includes labels when provided", async () => {
    execaMock.mockResolvedValue({
      stdout: "https://github.com/owner/repo/issues/100\n",
    });

    await createIssue({
      repositoryRoot: "/workspace",
      repository: "owner/repo",
      title: "QA handoff",
      body: "body",
      labels: ["qa-handoff", "exploratory"],
    });

    const args = (execaMock.mock.calls[0] as [string, string[]])[1];
    expect(args).toContain("--label");
    expect(args).toContain("qa-handoff");
    expect(args).toContain("exploratory");
  });

  it("includes assignees when provided", async () => {
    execaMock.mockResolvedValue({
      stdout: "https://github.com/owner/repo/issues/101\n",
    });

    await createIssue({
      repositoryRoot: "/workspace",
      repository: "owner/repo",
      title: "QA handoff",
      body: "body",
      assignees: ["alice", "bob"],
    });

    const args = (execaMock.mock.calls[0] as [string, string[]])[1];
    expect(args).toContain("--assignee");
    expect(args).toContain("alice");
    expect(args).toContain("bob");
  });

  it("throws on URL that cannot be parsed for issue number", async () => {
    execaMock.mockResolvedValue({
      stdout: "not-a-url\n",
    });

    await expect(
      createIssue({
        repositoryRoot: "/workspace",
        repository: "owner/repo",
        title: "QA handoff",
        body: "body",
      }),
    ).rejects.toThrow(/Could not parse issue number/);
  });

  it("throws on gh command failure", async () => {
    execaMock.mockRejectedValue(
      Object.assign(new Error("Command failed"), {
        exitCode: 1,
        stderr: "Not Found",
      }),
    );

    await expect(
      createIssue({
        repositoryRoot: "/workspace",
        repository: "owner/repo",
        title: "QA handoff",
        body: "body",
      }),
    ).rejects.toThrow(/gh.*issue/);
  });
});

describe("editIssueBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls gh issue edit with correct args", async () => {
    execaMock.mockResolvedValue({ stdout: "" });

    await editIssueBody({
      repositoryRoot: "/workspace",
      repository: "owner/repo",
      issueNumber: 99,
      body: "Updated body",
    });

    expect(execaMock).toHaveBeenCalledOnce();
    const [command, args, options] = execaMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(command).toBe("gh");
    expect(args).toContain("issue");
    expect(args).toContain("edit");
    expect(args).toContain("99");
    expect(args).toContain("--repo");
    expect(args).toContain("owner/repo");
    expect(args).toContain("--body-file");
    expect(options.cwd).toBe("/workspace");
  });

  it("throws on gh command failure", async () => {
    execaMock.mockRejectedValue(
      Object.assign(new Error("Command failed"), {
        exitCode: 1,
        stderr: "Not Found",
      }),
    );

    await expect(
      editIssueBody({
        repositoryRoot: "/workspace",
        repository: "owner/repo",
        issueNumber: 99,
        body: "body",
      }),
    ).rejects.toThrow(/gh.*issue/);
  });
});

describe("addIssueComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls gh issue comment with correct args and parses plain-text URL output", async () => {
    execaMock.mockResolvedValue({
      stdout: "https://github.com/owner/repo/issues/99#issuecomment-789\n",
    });

    const result = await addIssueComment({
      repositoryRoot: "/workspace",
      repository: "owner/repo",
      issueNumber: 99,
      body: "Findings comment",
    });

    expect(execaMock).toHaveBeenCalledOnce();
    const [command, args, options] = execaMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(command).toBe("gh");
    expect(args).toContain("issue");
    expect(args).toContain("comment");
    expect(args).toContain("99");
    expect(args).toContain("--repo");
    expect(args).toContain("owner/repo");
    expect(args).toContain("--body-file");
    expect(options.cwd).toBe("/workspace");

    expect(result.url).toBe(
      "https://github.com/owner/repo/issues/99#issuecomment-789",
    );
  });

  it("throws on empty gh output", async () => {
    execaMock.mockResolvedValue({
      stdout: "",
    });

    await expect(
      addIssueComment({
        repositoryRoot: "/workspace",
        repository: "owner/repo",
        issueNumber: 99,
        body: "body",
      }),
    ).rejects.toThrow();
  });

  it("throws on gh command failure", async () => {
    execaMock.mockRejectedValue(
      Object.assign(new Error("Command failed"), {
        exitCode: 1,
        stderr: "auth required",
      }),
    );

    await expect(
      addIssueComment({
        repositoryRoot: "/workspace",
        repository: "owner/repo",
        issueNumber: 99,
        body: "body",
      }),
    ).rejects.toThrow(/gh.*issue/);
  });
});
