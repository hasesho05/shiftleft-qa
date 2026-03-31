import { afterEach, describe, expect, it } from "vitest";

import { listStepProgressSnapshots } from "../../src/exploratory-testing/db/workspace-repository";
import {
  readProgressSummaryDocument,
  readStepHandoverDocument,
} from "../../src/exploratory-testing/tools/progress";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("initializeWorkspace", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  it("initializes the workspace state and remains idempotent", async () => {
    const workspace = await registerWorkspace();

    const firstRun = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    const secondRun = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    const summary = await readProgressSummaryDocument(
      firstRun.progressSummaryPath,
    );
    const setupDocument = await readStepHandoverDocument(
      firstRun.setupProgressPath,
    );
    const snapshots = listStepProgressSnapshots(firstRun.databasePath);

    expect(firstRun.createdConfig).toBe(true);
    expect(secondRun.createdConfig).toBe(false);
    expect(firstRun.journalMode.toLowerCase()).toBe("wal");
    expect(firstRun.foreignKeys).toBe(1);
    expect(summary.frontmatter.current_step).toBe("pr-intake");
    expect(summary.frontmatter.completed_steps).toBe(1);
    expect(setupDocument.frontmatter.step_name).toBe("setup");
    expect(setupDocument.frontmatter.status).toBe("completed");
    expect(snapshots).toHaveLength(9);
    expect(snapshots[0]?.status).toBe("completed");
    expect(snapshots[1]?.status).toBe("pending");
  });
});

async function registerWorkspace(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();
  workspaces.push(workspace.root);

  return workspace;
}
