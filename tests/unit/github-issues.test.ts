import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

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
      stdout: JSON.stringify({
        number: 99,
        url: "https://github.com/owner/repo/issues/99",
        title: "QA: PR #42",
      }),
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
    expect(args).toContain("--body");
    expect(args).toContain("## Handoff\n\nTest body");
    expect(args).toContain("--json");
    expect(args).toContain("number,url,title");
    expect(options.cwd).toBe("/workspace");

    expect(result.number).toBe(99);
    expect(result.url).toBe("https://github.com/owner/repo/issues/99");
    expect(result.title).toBe("QA: PR #42");
  });

  it("includes labels when provided", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify({
        number: 100,
        url: "https://github.com/owner/repo/issues/100",
        title: "QA handoff",
      }),
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
      stdout: JSON.stringify({
        number: 101,
        url: "https://github.com/owner/repo/issues/101",
        title: "QA handoff",
      }),
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

  it("throws on invalid gh output", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify({ invalid: true }),
    });

    await expect(
      createIssue({
        repositoryRoot: "/workspace",
        repository: "owner/repo",
        title: "QA handoff",
        body: "body",
      }),
    ).rejects.toThrow();
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
    ).rejects.toThrow(/gh.*issue.*create/);
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
    expect(args).toContain("--body");
    expect(args).toContain("Updated body");
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
    ).rejects.toThrow(/gh.*issue.*edit/);
  });
});

describe("addIssueComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls gh issue comment with correct args and parses plain-text URL output", async () => {
    // gh issue comment outputs a plain-text URL, not JSON
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
    expect(args).toContain("--body");
    expect(args).toContain("Findings comment");
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
    ).rejects.toThrow(/gh.*issue.*comment/);
  });
});
