import {
  findLatestRiskAssessmentByPr,
  listAllocationItems,
  resolvePrIdentity,
} from "../db/workspace-repository";
import { readPluginConfig } from "./config";
import { runPublishHandoffLifecycle } from "./handoff";

export type PublishHandoffOrchestrationInput = {
  readonly prNumber: number;
  readonly provider?: string;
  readonly repository?: string;
  readonly issueNumber?: number;
  readonly sessionId?: number;
  readonly title?: string;
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type PublishHandoffOrchestrationResult = {
  readonly prNumber: number;
  readonly action: "created" | "updated";
  readonly issueNumber: number;
  readonly issueUrl: string | undefined;
  readonly title: string;
  readonly findingsCommentAdded: boolean;
};

export async function runPublishHandoffOrchestration(
  input: PublishHandoffOrchestrationInput,
): Promise<PublishHandoffOrchestrationResult> {
  const configPath = input.configPath ?? "config.json";
  const manifestPath = input.manifestPath ?? ".claude-plugin/plugin.json";
  const config = await readPluginConfig(configPath, manifestPath);

  const { provider, repository } = resolveProviderRepository(
    config.paths.database,
    input.prNumber,
    input.provider,
    input.repository,
  );

  const riskAssessment = findLatestRiskAssessmentByPr(
    config.paths.database,
    provider,
    repository,
    input.prNumber,
  );

  if (!riskAssessment) {
    throw new Error(
      `No analysis found for ${provider}/${repository}#${input.prNumber}. Run analyze-pr and design-handoff first.`,
    );
  }

  // Verify allocation exists (design-handoff must have been run)
  const allocationItems = listAllocationItems(
    config.paths.database,
    riskAssessment.id,
  );
  if (allocationItems.length === 0) {
    throw new Error(
      `No allocation found for ${provider}/${repository}#${input.prNumber}. Run design-handoff before publish-handoff.`,
    );
  }

  const lifecycle = await runPublishHandoffLifecycle({
    riskAssessmentId: riskAssessment.id,
    issueNumber: input.issueNumber,
    sessionId: input.sessionId,
    title: input.title,
    labels: input.labels,
    assignees: input.assignees,
    configPath,
    manifestPath,
  });

  return {
    prNumber: input.prNumber,
    action: lifecycle.action,
    issueNumber: lifecycle.issueNumber,
    issueUrl: lifecycle.issueUrl,
    title: lifecycle.title,
    findingsCommentAdded: lifecycle.findingsCommentUrl !== undefined,
  };
}

/**
 * Resolve provider and repository for a PR lookup.
 * If both are provided, use them directly.
 * Otherwise, resolve from DB with ambiguity check.
 */
function resolveProviderRepository(
  databasePath: string,
  prNumber: number,
  inputProvider: string | undefined,
  inputRepository: string | undefined,
): { readonly provider: string; readonly repository: string } {
  if (inputProvider && inputRepository) {
    return { provider: inputProvider, repository: inputRepository };
  }

  const identity = resolvePrIdentity(databasePath, prNumber);
  if (!identity) {
    throw new Error(
      `No prior analysis found for PR #${prNumber}. Run analyze-pr first.`,
    );
  }

  return identity;
}
