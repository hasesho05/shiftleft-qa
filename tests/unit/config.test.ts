import { afterEach, describe, expect, it } from "vitest";

import {
  ensurePluginConfig,
  readPluginConfig,
} from "../../src/exploratory-testing/tools/config";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("plugin config", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  it("creates a default config and resolves absolute workspace paths", async () => {
    const workspace = await registerWorkspace();
    const ensured = await ensurePluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const resolved = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    expect(ensured.created).toBe(true);
    expect(ensured.rawConfig.paths.database).toBe("exploratory-testing.db");
    expect(ensured.rawConfig.publishDefaults.mode).toBe("create-or-update");
    expect(resolved.paths.database).toBe(
      `${workspace.root}/exploratory-testing.db`,
    );
    expect(resolved.publishDefaults.mode).toBe("create-or-update");
    expect(resolved.publishDefaults.repository).toBeUndefined();
    expect(resolved.publishDefaults.titlePrefix).toBeUndefined();
  });
});

async function registerWorkspace(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();
  workspaces.push(workspace.root);

  return workspace;
}
