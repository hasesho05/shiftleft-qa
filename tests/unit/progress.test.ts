import { afterEach, describe, expect, it } from "vitest";

import { listStepProgressSnapshots } from "../../src/exploratory-testing/db/workspace-repository";
import {
  readProgressSummaryDocument,
  readStepHandoverDocument,
  writeStepHandover,
} from "../../src/exploratory-testing/tools/progress";
import {
  initializeDatabaseFromConfig,
  initializeWorkspace,
} from "../../src/exploratory-testing/tools/setup";
import {
  type TestWorkspace,
  cleanupTestWorkspace,
  createTestWorkspace,
} from "../helpers/workspace";

const workspaces: string[] = [];

describe("writeStepHandover", () => {
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(cleanupTestWorkspace));
  });

  it("persists step handovers and refreshes the progress summary", async () => {
    const workspace = await registerWorkspace();
    const setup = await initializeWorkspace(
      workspace.configPath,
      workspace.manifestPath,
    );

    const handover = await writeStepHandover(
      {
        stepName: "pr-intake",
        status: "in_progress",
        summary: "Collecting PR metadata and changed files.",
        nextStep: "discover-context",
        enforceWorkflowPrerequisites: true,
      },
      workspace.configPath,
      workspace.manifestPath,
    );
    const handoverDocument = await readStepHandoverDocument(handover.filePath);
    const summaryDocument = await readProgressSummaryDocument(
      setup.progressSummaryPath,
    );

    expect(handoverDocument.frontmatter.step_name).toBe("pr-intake");
    expect(handoverDocument.frontmatter.status).toBe("in_progress");
    expect(handoverDocument.frontmatter.next_step).toBe("discover-context");
    expect(summaryDocument.frontmatter.current_step).toBe("pr-intake");
    expect(summaryDocument.body).toContain(
      "| 2 | PR or MR intake | pr-intake | in_progress |",
    );
  });

  it("rejects out-of-order handovers until the previous step is completed", async () => {
    const workspace = await registerWorkspace();
    const initialized = await initializeDatabaseFromConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    await expect(
      writeStepHandover(
        {
          stepName: "pr-intake",
          status: "in_progress",
          summary: "Collecting PR metadata and changed files.",
          nextStep: "discover-context",
          enforceWorkflowPrerequisites: true,
        },
        workspace.configPath,
        workspace.manifestPath,
      ),
    ).rejects.toThrow(/setup.*completed/i);

    const snapshots = listStepProgressSnapshots(initialized.databasePath);
    expect(snapshots[0]?.status).toBe("pending");
    expect(snapshots[1]?.status).toBe("pending");
  });

  it("allows setup handovers even when workflow prerequisites are enforced", async () => {
    const workspace = await registerWorkspace();
    const initialized = await initializeDatabaseFromConfig(
      workspace.configPath,
      workspace.manifestPath,
    );

    const handover = await writeStepHandover(
      {
        stepName: "setup",
        status: "completed",
        summary: "Workspace state initialized for exploratory testing.",
        nextStep: "pr-intake",
        enforceWorkflowPrerequisites: true,
      },
      workspace.configPath,
      workspace.manifestPath,
    );

    const snapshots = listStepProgressSnapshots(initialized.databasePath);
    expect(handover.snapshot.stepName).toBe("setup");
    expect(snapshots[0]?.status).toBe("completed");
  });
});

async function registerWorkspace(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();
  workspaces.push(workspace.root);

  return workspace;
}
