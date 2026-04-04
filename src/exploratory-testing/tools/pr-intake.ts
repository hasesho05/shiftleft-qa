import {
  type PersistedIntentContext,
  type PersistedPrIntake,
  saveIntentContext,
  savePrIntake,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import type { ResolvedPluginConfig } from "../models/config";
import type { IntentContext } from "../models/intent-context";
import type { PrMetadata } from "../models/pr-intake";
import {
  fetchLinkedIssueBodies,
  parseLinkedIssueNumbers,
} from "../scm/fetch-github";
import { fetchPrMetadata } from "../scm/fetch-pr";
import { parseIntentContext } from "../scm/intent-parser";
import { readPluginConfig } from "./config";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

export type PrIntakeInput = {
  readonly prNumber: number;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type PrIntakeResult = {
  readonly persisted: PersistedPrIntake;
  readonly intentContext: PersistedIntentContext | null;
  readonly handover: StepHandoverWriteResult;
};

export async function runPrIntake(
  input: PrIntakeInput,
): Promise<PrIntakeResult> {
  const configPath = input.configPath ?? "config.json";
  const manifestPath = input.manifestPath ?? ".claude-plugin/plugin.json";
  const config = await readPluginConfig(configPath, manifestPath);

  const metadata = await fetchPrMetadata({
    prNumber: input.prNumber,
    repositoryRoot: config.workspaceRoot,
    scmProvider: config.scmProvider,
  });

  let linkedIssueBodies: ReadonlyMap<number, string> | undefined;
  if (metadata.linkedIssues.length > 0 && config.scmProvider === "github") {
    const issueNumbers = parseLinkedIssueNumbers(metadata.linkedIssues);
    if (issueNumbers.length > 0) {
      try {
        linkedIssueBodies = await fetchLinkedIssueBodies(
          issueNumbers,
          config.workspaceRoot,
        );
      } catch {
        // best-effort: continue without linked issue bodies
      }
    }
  }

  return savePrIntakeResult(
    metadata,
    config.paths.database,
    config,
    linkedIssueBodies,
  );
}

export async function savePrIntakeResult(
  metadata: PrMetadata,
  databasePath: string,
  config: ResolvedPluginConfig,
  linkedIssueBodies?: ReadonlyMap<number, string>,
): Promise<PrIntakeResult> {
  const persisted = savePrIntake(databasePath, metadata);

  const intentContext = extractAndSaveIntentContext(
    databasePath,
    persisted.id,
    metadata,
    linkedIssueBodies,
  );

  const body = buildIntakeHandoverBody(metadata, intentContext);

  const contextSummary =
    intentContext.extractionStatus !== "empty"
      ? `, context: ${intentContext.extractionStatus}`
      : "";

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "pr-intake",
    status: "completed",
    summary: `Ingested ${metadata.repository}#${metadata.prNumber} (${metadata.changedFiles.length} files, ${metadata.reviewComments.length} comments${contextSummary})`,
    body,
  });

  return { persisted, intentContext, handover };
}

function extractAndSaveIntentContext(
  databasePath: string,
  prIntakeId: number,
  metadata: PrMetadata,
  linkedIssueBodies?: ReadonlyMap<number, string>,
): PersistedIntentContext {
  const sources: string[] = [];

  if (metadata.description.trim().length > 0) {
    sources.push(metadata.description);
  }

  const sourceRefs: string[] = [];

  if (linkedIssueBodies) {
    for (const [num, body] of linkedIssueBodies.entries()) {
      if (body.trim().length > 0) {
        sources.push(body);
        sourceRefs.push(`#${num}`);
      }
    }
  }

  const context = parseIntentContext(sources, sourceRefs);
  return saveIntentContext(databasePath, prIntakeId, context);
}

function buildIntakeHandoverBody(
  metadata: PrMetadata,
  intentContext: IntentContext,
): string {
  const lines = [
    `# PR/MR Intake: ${escapePipe(metadata.repository)}#${metadata.prNumber}`,
    "",
    "## Metadata",
    "",
    `- **Provider**: ${metadata.provider}`,
    `- **Repository**: ${escapePipe(metadata.repository)}`,
    `- **PR Number**: ${metadata.prNumber}`,
    `- **Title**: ${escapePipe(metadata.title)}`,
    `- **Author**: ${escapePipe(metadata.author)}`,
    `- **Base Branch**: ${escapePipe(metadata.baseBranch)}`,
    `- **Head Branch**: ${escapePipe(metadata.headBranch)}`,
    `- **Head SHA**: ${metadata.headSha}`,
    "",
  ];

  if (metadata.linkedIssues.length > 0) {
    lines.push("## Linked Issues", "");
    for (const issue of metadata.linkedIssues) {
      lines.push(`- ${escapePipe(issue)}`);
    }
    lines.push("");
  }

  lines.push(
    "## Changed Files",
    "",
    "| Path | Status | +/- |",
    "| --- | --- | --- |",
  );
  for (const file of metadata.changedFiles) {
    lines.push(
      `| ${escapePipe(file.path)} | ${file.status} | +${file.additions} -${file.deletions} |`,
    );
  }
  lines.push("");

  if (metadata.reviewComments.length > 0) {
    lines.push("## Review Comments", "");
    for (const comment of metadata.reviewComments) {
      const location = comment.path ? ` (${escapePipe(comment.path)})` : "";
      lines.push(
        `- **${escapePipe(comment.author)}**${location}: ${escapePipe(comment.body)}`,
      );
    }
    lines.push("");
  }

  if (intentContext.extractionStatus !== "empty") {
    lines.push("## Intent Context", "");
    lines.push(`- **Extraction Status**: ${intentContext.extractionStatus}`);
    if (intentContext.changePurpose) {
      lines.push(`- **Change Purpose**: ${intentContext.changePurpose}`);
    }
    if (intentContext.userStory) {
      lines.push(`- **User Story**: ${escapePipe(intentContext.userStory)}`);
    }
    if (intentContext.acceptanceCriteria.length > 0) {
      lines.push("", "### Acceptance Criteria", "");
      for (const criterion of intentContext.acceptanceCriteria) {
        lines.push(`- ${escapePipe(criterion)}`);
      }
    }
    if (intentContext.nonGoals.length > 0) {
      lines.push("", "### Non-Goals", "");
      for (const goal of intentContext.nonGoals) {
        lines.push(`- ${escapePipe(goal)}`);
      }
    }
    if (intentContext.targetUsers.length > 0) {
      lines.push("", "### Target Users", "");
      for (const user of intentContext.targetUsers) {
        lines.push(`- ${escapePipe(user)}`);
      }
    }
    if (intentContext.notesForQa.length > 0) {
      lines.push("", "### QA Notes", "");
      for (const note of intentContext.notesForQa) {
        lines.push(`- ${escapePipe(note)}`);
      }
    }
    lines.push("");
  }

  lines.push("## Next step", "", "- discover-context", "");

  return lines.join("\n");
}
