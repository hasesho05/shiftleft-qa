import { afterEach, describe, expect, it } from "vitest";

import {
  findIntentContext,
  findPrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { savePrIntakeResult } from "../../src/exploratory-testing/tools/pr-intake";
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

  it("saves metadata to DB", async () => {
    const workspace = await setupWorkspace();
    const metadata = createSampleMetadata();

    const result = savePrIntakeResult(metadata, workspace.databasePath);

    expect(result.persisted.prNumber).toBe(42);
    expect(result.persisted.headSha).toBe("abc1234");

    const dbRecord = findPrIntake(
      workspace.databasePath,
      "github",
      "owner/repo",
      42,
    );
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.title).toBe("Add feature X");
  });

  it("extracts and saves intent context from PR description", async () => {
    const workspace = await setupWorkspace();
    const metadata: PrMetadata = {
      ...createSampleMetadata(),
      description: [
        "## Purpose",
        "Add a new dashboard feature",
        "",
        "## Acceptance Criteria",
        "- Shows recent activity",
        "- Loads in < 2s",
        "",
        "## Non-Goals",
        "- Mobile support",
        "",
      ].join("\n"),
    };

    const result = savePrIntakeResult(metadata, workspace.databasePath);

    expect(result.intentContext).not.toBeNull();
    expect(result.intentContext?.changePurpose).toBe("feature");
    expect(result.intentContext?.acceptanceCriteria).toEqual([
      "Shows recent activity",
      "Loads in < 2s",
    ]);
    expect(result.intentContext?.nonGoals).toEqual(["Mobile support"]);

    const dbContext = findIntentContext(
      workspace.databasePath,
      result.persisted.id,
    );
    expect(dbContext).not.toBeNull();
    expect(dbContext?.changePurpose).toBe("feature");
  });

  it("extracts fallback intent context from unstructured body", async () => {
    const workspace = await setupWorkspace();
    const metadata: PrMetadata = {
      ...createSampleMetadata(),
      description: "Just a plain description with no sections",
    };

    const result = savePrIntakeResult(metadata, workspace.databasePath);

    expect(result.intentContext).not.toBeNull();
    // Fallback extraction picks up the first paragraph as userStory
    expect(result.intentContext?.extractionStatus).toBe("parsed");
    expect(result.intentContext?.userStory).toBe(
      "Just a plain description with no sections",
    );
  });

  it("is idempotent for same PR", async () => {
    const workspace = await setupWorkspace();
    const metadata = createSampleMetadata();

    const first = savePrIntakeResult(metadata, workspace.databasePath);
    const second = savePrIntakeResult(
      { ...metadata, title: "Updated title" },
      workspace.databasePath,
    );

    expect(first.persisted.id).toBe(second.persisted.id);
    expect(second.persisted.title).toBe("Updated title");
  });
});
