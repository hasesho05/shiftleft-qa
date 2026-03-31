import { afterEach, describe, expect, it } from "vitest";

import {
  readProgressSummaryDocument,
  readStepHandoverDocument,
  writeStepHandover,
} from "../../src/exploratory-testing/tools/progress";
import { initializeWorkspace } from "../../src/exploratory-testing/tools/setup";
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
});

async function registerWorkspace(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();
  workspaces.push(workspace.root);

  return workspace;
}
