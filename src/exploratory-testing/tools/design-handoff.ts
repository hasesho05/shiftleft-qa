import {
  findLatestRiskAssessmentByPr,
  resolvePrIdentity,
} from "../db/workspace-repository";
import type { AllocationDestinationCounts } from "../models/allocation";
import { runAllocate } from "./allocate";
import { readPluginConfig } from "./config";
import type { HandoffSections, HandoffSummary } from "./handoff";
import { generateHandoffMarkdown } from "./handoff";

export type DesignHandoffInput = {
  readonly prNumber: number;
  readonly provider?: string;
  readonly repository?: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type DesignHandoffDraft = {
  readonly markdown: string;
  readonly alreadyCovered: {
    readonly count: number;
    readonly highlights: readonly string[];
  };
  readonly shouldAutomate: {
    readonly count: number;
    readonly highlights: readonly string[];
  };
  readonly manualExploration: {
    readonly count: number;
    readonly highlights: readonly string[];
  };
};

export type DesignHandoffResult = {
  readonly prNumber: number;
  readonly repository: string;
  readonly draft: DesignHandoffDraft;
  readonly counts: AllocationDestinationCounts;
  readonly summary: HandoffSummary;
};

export async function runDesignHandoff(
  input: DesignHandoffInput,
): Promise<DesignHandoffResult> {
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
      `No analysis found for ${provider}/${repository}#${input.prNumber}. Run analyze-pr first.`,
    );
  }

  // Run allocation
  await runAllocate({
    riskAssessmentId: riskAssessment.id,
    configPath,
    manifestPath,
  });

  // Generate handoff markdown
  const markdown = await generateHandoffMarkdown({
    riskAssessmentId: riskAssessment.id,
    configPath,
    manifestPath,
  });

  return {
    prNumber: input.prNumber,
    repository: markdown.repository,
    draft: buildDraft(markdown.sections, markdown.markdown),
    counts: markdown.counts,
    summary: markdown.summary,
  };
}

function buildDraft(
  sections: HandoffSections,
  markdown: string,
): DesignHandoffDraft {
  return {
    markdown,
    alreadyCovered: {
      count: sections.alreadyCovered.length,
      highlights: sections.alreadyCovered.slice(0, 5).map((item) => item.title),
    },
    shouldAutomate: {
      count: sections.shouldAutomate.length,
      highlights: sections.shouldAutomate
        .slice(0, 5)
        .map((item) => `${item.title} → ${item.recommendedDestination}`),
    },
    manualExploration: {
      count: sections.manualExploration.length,
      highlights: sections.manualExploration
        .slice(0, 5)
        .map((item) => item.title),
    },
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
