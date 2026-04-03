import {
  type PersistedPrIntake,
  savePrIntake,
} from "../db/workspace-repository";
import type { ResolvedPluginConfig } from "../models/config";
import type { PrMetadata } from "../models/pr-intake";
import { fetchPrMetadata } from "../scm/fetch-pr";
import { readPluginConfig } from "./config";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";
import { escapePipe } from "../lib/markdown";

export type PrIntakeInput = {
  readonly prNumber: number;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type PrIntakeResult = {
  readonly persisted: PersistedPrIntake;
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

  return savePrIntakeResult(metadata, config.paths.database, config);
}

export async function savePrIntakeResult(
  metadata: PrMetadata,
  databasePath: string,
  config: ResolvedPluginConfig,
): Promise<PrIntakeResult> {
  const persisted = savePrIntake(databasePath, metadata);
  const body = buildIntakeHandoverBody(metadata);

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "pr-intake",
    status: "completed",
    summary: `Ingested ${metadata.repository}#${metadata.prNumber} (${metadata.changedFiles.length} files, ${metadata.reviewComments.length} comments)`,
    body,
  });

  return { persisted, handover };
}

function buildIntakeHandoverBody(metadata: PrMetadata): string {
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

  lines.push("## Next step", "", "- discover-context", "");

  return lines.join("\n");
}
