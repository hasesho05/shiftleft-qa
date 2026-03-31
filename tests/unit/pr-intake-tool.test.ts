import { afterEach, describe, expect, it } from "vitest";

import { findPrIntake } from "../../src/exploratory-testing/db/workspace-repository";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { savePrIntakeResult } from "../../src/exploratory-testing/tools/pr-intake";
import { readStepHandoverDocument } from "../../src/exploratory-testing/tools/progress";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

function createSampleMetadata(): PrMetadata {
  return {
    provider: "github",
    repository: "owner/repo",
    prNumber: 42,
    title: "Add feature X",
    description: "Implements feature X",
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
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

describe("savePrIntakeResult", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setupWorkspace(): Promise<
    TestWorkspace & {
      databasePath: string;
    }
  > {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    return {
      ...workspace,
      databasePath: result.databasePath,
    };
  }

  it("saves metadata to DB and writes progress file", async () => {
    const workspace = await setupWorkspace();
    const metadata = createSampleMetadata();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const result = await savePrIntakeResult(
      metadata,
      config.paths.database,
      config,
    );

    expect(result.persisted.prNumber).toBe(42);
    expect(result.persisted.headSha).toBe("abc1234");
    expect(result.handover.snapshot.stepName).toBe("pr-intake");
    expect(result.handover.snapshot.status).toBe("completed");

    const dbRecord = findPrIntake(
      workspace.databasePath,
      "github",
      "owner/repo",
      42,
    );
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.title).toBe("Add feature X");

    const handoverDoc = await readStepHandoverDocument(
      result.handover.filePath,
    );
    expect(handoverDoc.frontmatter.step_name).toBe("pr-intake");
    expect(handoverDoc.frontmatter.status).toBe("completed");
    expect(handoverDoc.body).toContain("owner/repo#42");
  });

  it("is idempotent for same PR", async () => {
    const workspace = await setupWorkspace();
    const metadata = createSampleMetadata();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const first = await savePrIntakeResult(
      metadata,
      config.paths.database,
      config,
    );
    const second = await savePrIntakeResult(
      { ...metadata, title: "Updated title" },
      config.paths.database,
      config,
    );

    expect(first.persisted.id).toBe(second.persisted.id);
    expect(second.persisted.title).toBe("Updated title");
  });
});
