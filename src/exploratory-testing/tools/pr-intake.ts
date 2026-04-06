import {
  type PersistedIntentContext,
  type PersistedPrIntake,
  saveIntentContext,
  savePrIntake,
} from "../db/workspace-repository";
import type { PrMetadata } from "../models/pr-intake";
import {
  fetchLinkedIssueBodies,
  parseLinkedIssueNumbers,
} from "../scm/fetch-github";
import { fetchPrMetadata } from "../scm/fetch-pr";
import { parseIntentContext } from "../scm/intent-parser";
import { readPluginConfig } from "./config";

export type PrIntakeInput = {
  readonly prNumber: number;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type PrIntakeResult = {
  readonly persisted: PersistedPrIntake;
  readonly intentContext: PersistedIntentContext | null;
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
  if (metadata.linkedIssues.length > 0 && metadata.provider === "github") {
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

  return savePrIntakeResult(metadata, config.paths.database, linkedIssueBodies);
}

export function savePrIntakeResult(
  metadata: PrMetadata,
  databasePath: string,
  linkedIssueBodies?: ReadonlyMap<number, string>,
): PrIntakeResult {
  const persisted = savePrIntake(databasePath, metadata);

  const intentContext = extractAndSaveIntentContext(
    databasePath,
    persisted.id,
    metadata,
    linkedIssueBodies,
  );

  return { persisted, intentContext };
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
