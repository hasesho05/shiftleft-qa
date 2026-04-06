import { afterEach, describe, expect, it } from "vitest";

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

    expect(firstRun.createdConfig).toBe(true);
    expect(secondRun.createdConfig).toBe(false);
    expect(firstRun.journalMode.toLowerCase()).toBe("wal");
    expect(firstRun.foreignKeys).toBe(1);
  });
});

async function registerWorkspace(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();
  workspaces.push(workspace.root);

  return workspace;
}
