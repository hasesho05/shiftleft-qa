import { afterEach, describe, expect, it } from "vitest";

import {
  findPrIntake,
  initializeWorkspaceDatabase,
  listPrIntakes,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

function createSamplePrMetadata(
  overrides: Partial<PrMetadata> = {},
): PrMetadata {
  return {
    provider: "github",
    repository: "owner/repo",
    prNumber: 42,
    title: "Add feature X",
    description: "Implements feature X",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/x",
    headSha: "abc1234def5678",
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
    ...overrides,
  };
}

describe("pr intake repository", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setupWorkspace(): Promise<{ databasePath: string }> {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    return { databasePath: result.databasePath };
  }

  it("saves and retrieves a PR intake record", async () => {
    const { databasePath } = await setupWorkspace();
    const metadata = createSamplePrMetadata();

    const saved = savePrIntake(databasePath, metadata);

    expect(saved.provider).toBe("github");
    expect(saved.repository).toBe("owner/repo");
    expect(saved.prNumber).toBe(42);
    expect(saved.headSha).toBe("abc1234def5678");

    const found = findPrIntake(databasePath, "github", "owner/repo", 42);

    expect(found).not.toBeNull();
    expect(found?.title).toBe("Add feature X");
    expect(found?.headSha).toBe("abc1234def5678");
  });

  it("upserts on same idempotency key (provider + repo + prNumber + headSha)", async () => {
    const { databasePath } = await setupWorkspace();
    const metadata = createSamplePrMetadata();

    savePrIntake(databasePath, metadata);
    const updated = savePrIntake(
      databasePath,
      createSamplePrMetadata({ title: "Updated title" }),
    );

    expect(updated.title).toBe("Updated title");

    const all = listPrIntakes(databasePath);
    expect(all).toHaveLength(1);
  });

  it("creates separate records for different head_sha", async () => {
    const { databasePath } = await setupWorkspace();

    savePrIntake(databasePath, createSamplePrMetadata({ headSha: "sha-v1" }));
    savePrIntake(databasePath, createSamplePrMetadata({ headSha: "sha-v2" }));

    const all = listPrIntakes(databasePath);
    expect(all).toHaveLength(2);
  });

  it("returns null when PR not found", async () => {
    const { databasePath } = await setupWorkspace();

    const found = findPrIntake(databasePath, "github", "owner/repo", 999);

    expect(found).toBeNull();
  });

  it("stores and retrieves changed files and review comments as JSON", async () => {
    const { databasePath } = await setupWorkspace();
    const metadata = createSamplePrMetadata();

    savePrIntake(databasePath, metadata);
    const found = findPrIntake(databasePath, "github", "owner/repo", 42);

    expect(found?.changedFiles).toHaveLength(1);
    expect(found?.changedFiles[0]?.path).toBe("src/index.ts");
    expect(found?.reviewComments).toHaveLength(1);
    expect(found?.reviewComments[0]?.author).toBe("bob");
  });
});
