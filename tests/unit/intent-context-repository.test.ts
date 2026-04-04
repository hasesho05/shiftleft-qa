import { afterEach, describe, expect, it } from "vitest";

import {
  findIntentContext,
  saveIntentContext,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

function createSamplePrMetadata(): PrMetadata {
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
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

function createSampleIntentContext(
  overrides: Partial<IntentContext> = {},
): IntentContext {
  return {
    changePurpose: "feature",
    userStory: "As a user, I want to see my dashboard",
    acceptanceCriteria: ["Shows recent activity", "Loads in < 2s"],
    nonGoals: ["Mobile support"],
    targetUsers: ["Admin users"],
    notesForQa: ["Check with slow network"],
    sourceRefs: ["#10"],
    extractionStatus: "parsed",
    ...overrides,
  };
}

describe("intent context repository", () => {
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

  it("saves and retrieves an intent context", async () => {
    const { databasePath } = await setupWorkspace();
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());
    const context = createSampleIntentContext();

    const saved = saveIntentContext(databasePath, prIntake.id, context);

    expect(saved.prIntakeId).toBe(prIntake.id);
    expect(saved.changePurpose).toBe("feature");
    expect(saved.userStory).toBe("As a user, I want to see my dashboard");
    expect(saved.acceptanceCriteria).toEqual([
      "Shows recent activity",
      "Loads in < 2s",
    ]);
    expect(saved.nonGoals).toEqual(["Mobile support"]);
    expect(saved.targetUsers).toEqual(["Admin users"]);
    expect(saved.notesForQa).toEqual(["Check with slow network"]);
    expect(saved.sourceRefs).toEqual(["#10"]);
    expect(saved.extractionStatus).toBe("parsed");

    const found = findIntentContext(databasePath, prIntake.id);
    expect(found).not.toBeNull();
    expect(found?.changePurpose).toBe("feature");
    expect(found?.acceptanceCriteria).toEqual([
      "Shows recent activity",
      "Loads in < 2s",
    ]);
  });

  it("upserts on same pr_intake_id", async () => {
    const { databasePath } = await setupWorkspace();
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());

    saveIntentContext(databasePath, prIntake.id, createSampleIntentContext());
    const updated = saveIntentContext(
      databasePath,
      prIntake.id,
      createSampleIntentContext({ changePurpose: "bugfix" }),
    );

    expect(updated.changePurpose).toBe("bugfix");
    const found = findIntentContext(databasePath, prIntake.id);
    expect(found?.changePurpose).toBe("bugfix");
  });

  it("saves empty context", async () => {
    const { databasePath } = await setupWorkspace();
    const prIntake = savePrIntake(databasePath, createSamplePrMetadata());

    const saved = saveIntentContext(
      databasePath,
      prIntake.id,
      createSampleIntentContext({
        changePurpose: null,
        userStory: null,
        acceptanceCriteria: [],
        nonGoals: [],
        targetUsers: [],
        notesForQa: [],
        sourceRefs: [],
        extractionStatus: "empty",
      }),
    );

    expect(saved.changePurpose).toBeNull();
    expect(saved.extractionStatus).toBe("empty");
  });

  it("returns null when no context exists for pr_intake_id", async () => {
    const { databasePath } = await setupWorkspace();

    const found = findIntentContext(databasePath, 999);
    expect(found).toBeNull();
  });
});
