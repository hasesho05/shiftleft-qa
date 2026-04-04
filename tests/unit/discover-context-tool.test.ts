import { afterEach, describe, expect, it } from "vitest";

import {
  findChangeAnalysis,
  saveIntentContext,
  savePrIntake,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";
import type { PrMetadata } from "../../src/exploratory-testing/models/pr-intake";
import { readPluginConfig } from "../../src/exploratory-testing/tools/config";
import { runDiscoverContextFromIntake } from "../../src/exploratory-testing/tools/discover-context";
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
    title: "Add user auth",
    description: "Implements authentication middleware",
    author: "alice",
    baseBranch: "main",
    headBranch: "feature/auth",
    headSha: "abc1234",
    linkedIssues: ["#10"],
    changedFiles: [
      {
        path: "src/middleware/auth.ts",
        status: "modified",
        additions: 30,
        deletions: 5,
        previousPath: null,
      },
      {
        path: "src/components/LoginForm.tsx",
        status: "added",
        additions: 80,
        deletions: 0,
        previousPath: null,
      },
      {
        path: "src/api/users.ts",
        status: "modified",
        additions: 15,
        deletions: 3,
        previousPath: null,
      },
      {
        path: "db/migrations/002_add_sessions.sql",
        status: "added",
        additions: 20,
        deletions: 0,
        previousPath: null,
      },
    ],
    reviewComments: [],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}

describe("runDiscoverContextFromIntake", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  async function setupWorkspace(): Promise<
    TestWorkspace & { databasePath: string }
  > {
    const workspace = await createTestWorkspace();
    workspaces.push(workspace.root);
    const result = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );
    return { ...workspace, databasePath: result.databasePath };
  }

  it("analyzes PR intake and saves results to DB and handover", async () => {
    const workspace = await setupWorkspace();
    const metadata = createSampleMetadata();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(workspace.databasePath, metadata);

    const result = await runDiscoverContextFromIntake(prIntake, config);

    // Verify DB persistence
    expect(result.persisted.prIntakeId).toBe(prIntake.id);
    expect(result.persisted.fileAnalyses.length).toBeGreaterThan(0);
    expect(result.persisted.viewpointSeeds).toHaveLength(5);

    const dbRecord = findChangeAnalysis(workspace.databasePath, prIntake.id);
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.summary).toBeTruthy();

    // Verify handover
    expect(result.handover.snapshot.stepName).toBe("discover-context");
    expect(result.handover.snapshot.status).toBe("completed");

    const handoverDoc = await readStepHandoverDocument(
      result.handover.filePath,
    );
    expect(handoverDoc.frontmatter.step_name).toBe("discover-context");
    expect(handoverDoc.body).toContain("File Change Analysis");
  });

  it("classifies auth middleware as permission", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    const result = await runDiscoverContextFromIntake(prIntake, config);

    const authFile = result.persisted.fileAnalyses.find(
      (f) => f.path === "src/middleware/auth.ts",
    );
    expect(authFile?.categories.some((c) => c.category === "permission")).toBe(
      true,
    );
  });

  it("classifies LoginForm as UI", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    const result = await runDiscoverContextFromIntake(prIntake, config);

    const uiFile = result.persisted.fileAnalyses.find(
      (f) => f.path === "src/components/LoginForm.tsx",
    );
    expect(uiFile?.categories.some((c) => c.category === "ui")).toBe(true);
  });

  it("classifies migration as schema", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    const result = await runDiscoverContextFromIntake(prIntake, config);

    const migrationFile = result.persisted.fileAnalyses.find((f) =>
      f.path.includes("migrations"),
    );
    expect(migrationFile?.categories.some((c) => c.category === "schema")).toBe(
      true,
    );
  });

  it("generates viewpoint seeds for all 5 viewpoints", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    const result = await runDiscoverContextFromIntake(prIntake, config);

    const viewpoints = result.persisted.viewpointSeeds.map((v) => v.viewpoint);
    expect(viewpoints).toContain("functional-user-flow");
    expect(viewpoints).toContain("user-persona");
    expect(viewpoints).toContain("ui-look-and-feel");
    expect(viewpoints).toContain("data-and-error-handling");
    expect(viewpoints).toContain("architecture-cross-cutting");
  });

  it("escapes pipe characters in file paths for handover markdown", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const metadata: PrMetadata = {
      ...createSampleMetadata(),
      changedFiles: [
        {
          path: "src/utils/foo|bar.ts",
          status: "added",
          additions: 5,
          deletions: 0,
          previousPath: null,
        },
      ],
    };
    const prIntake = savePrIntake(workspace.databasePath, metadata);

    const result = await runDiscoverContextFromIntake(prIntake, config);

    const handoverDoc = await readStepHandoverDocument(
      result.handover.filePath,
    );
    expect(handoverDoc.body).toContain("foo\\|bar.ts");
    expect(handoverDoc.body).not.toContain("| src/utils/foo|bar.ts |");
  });

  it("is idempotent for same PR intake", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    const first = await runDiscoverContextFromIntake(prIntake, config);
    const second = await runDiscoverContextFromIntake(prIntake, config);

    expect(first.persisted.id).toBe(second.persisted.id);
  });

  it("merges intent-derived seeds into viewpoint seeds when intent context exists", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    const intentContext: IntentContext = {
      changePurpose: "feature",
      userStory: "As an admin, I can manage user sessions",
      acceptanceCriteria: ["Login form validates input"],
      nonGoals: [],
      targetUsers: ["admin", "viewer"],
      notesForQa: [],
      sourceRefs: [],
      extractionStatus: "parsed",
    };
    saveIntentContext(workspace.databasePath, prIntake.id, intentContext);

    const result = await runDiscoverContextFromIntake(prIntake, config);

    // Should include intent-derived seeds in user-persona viewpoint
    const personaSeeds = result.persisted.viewpointSeeds.find(
      (v) => v.viewpoint === "user-persona",
    );
    expect(personaSeeds).toBeDefined();
    expect(personaSeeds?.seeds.some((s) => s.includes("admin"))).toBe(true);
  });

  it("works normally without intent context", async () => {
    const workspace = await setupWorkspace();
    const config = await readPluginConfig(
      workspace.configPath,
      workspace.manifestPath,
    );
    const prIntake = savePrIntake(
      workspace.databasePath,
      createSampleMetadata(),
    );

    // No intent context saved — should still work
    const result = await runDiscoverContextFromIntake(prIntake, config);

    expect(result.persisted.viewpointSeeds).toHaveLength(5);
  });
});
