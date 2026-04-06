import { classifyFileChange } from "../analysis/classify-file-change";
import {
  extractIntentViewpointSeeds,
  extractViewpointSeeds,
} from "../analysis/extract-viewpoint-seeds";
import { findRelatedCodeCandidates } from "../analysis/find-related-code";
import {
  type PersistedChangeAnalysis,
  type PersistedPrIntake,
  findIntentContext,
  findPrIntake,
  saveChangeAnalysis,
} from "../db/workspace-repository";
import type {
  ChangeAnalysisResult,
  FileChangeAnalysis,
  ViewpointSeed,
} from "../models/change-analysis";
import type { ResolvedPluginConfig } from "../models/config";
import { readPluginConfig } from "./config";

export type DiscoverContextInput = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type DiscoverContextResult = {
  readonly persisted: PersistedChangeAnalysis;
};

export async function runDiscoverContext(
  input: DiscoverContextInput,
): Promise<DiscoverContextResult> {
  const configPath = input.configPath ?? "config.json";
  const manifestPath = input.manifestPath ?? ".claude-plugin/plugin.json";
  const config = await readPluginConfig(configPath, manifestPath);

  const prIntake = findPrIntake(
    config.paths.database,
    input.provider,
    input.repository,
    input.prNumber,
  );

  if (!prIntake) {
    throw new Error(
      `PR intake not found for ${input.provider}/${input.repository}#${input.prNumber}. Run analyze-pr first.`,
    );
  }

  return runDiscoverContextFromIntake(prIntake, config);
}

export async function runDiscoverContextFromIntake(
  prIntake: PersistedPrIntake,
  config: ResolvedPluginConfig,
): Promise<DiscoverContextResult> {
  const fileAnalyses = analyzeFiles(prIntake);
  const relatedCodes = findRelatedCodeCandidates(prIntake.changedFiles);
  const codeSeeds = extractViewpointSeeds(fileAnalyses);

  const intentContext = findIntentContext(config.paths.database, prIntake.id);
  const intentSeeds = intentContext
    ? extractIntentViewpointSeeds(intentContext)
    : [];
  const viewpointSeeds = mergeViewpointSeeds(codeSeeds, intentSeeds);

  const summary = buildSummary(fileAnalyses, prIntake);

  const analysisResult: ChangeAnalysisResult = {
    prIntakeId: prIntake.id,
    fileAnalyses: [...fileAnalyses],
    relatedCodes: [...relatedCodes],
    viewpointSeeds: [...viewpointSeeds],
    summary,
    analyzedAt: new Date().toISOString(),
  };

  const persisted = saveChangeAnalysis(config.paths.database, analysisResult);

  return { persisted };
}

function mergeViewpointSeeds(
  codeSeeds: readonly ViewpointSeed[],
  intentSeeds: readonly ViewpointSeed[],
): readonly ViewpointSeed[] {
  if (intentSeeds.length === 0) {
    return codeSeeds;
  }

  const intentMap = new Map(intentSeeds.map((s) => [s.viewpoint, s.seeds]));

  return codeSeeds.map((seed) => {
    const intentSeedsForViewpoint = intentMap.get(seed.viewpoint) ?? [];
    if (intentSeedsForViewpoint.length === 0) {
      return seed;
    }
    return {
      viewpoint: seed.viewpoint,
      seeds: [...seed.seeds, ...intentSeedsForViewpoint],
    };
  });
}

function analyzeFiles(
  prIntake: PersistedPrIntake,
): readonly FileChangeAnalysis[] {
  return prIntake.changedFiles.map((file) => ({
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    categories: [...classifyFileChange(file)],
  }));
}

function buildSummary(
  fileAnalyses: readonly FileChangeAnalysis[],
  prIntake: PersistedPrIntake,
): string {
  const categorySet = new Set<string>();

  for (const fa of fileAnalyses) {
    for (const cat of fa.categories) {
      categorySet.add(cat.category);
    }
  }

  const categories = [...categorySet].sort();

  if (categories.length === 0) {
    return `${prIntake.repository}#${prIntake.prNumber}: ${fileAnalyses.length} files analyzed, no specific categories detected`;
  }

  return `${prIntake.repository}#${prIntake.prNumber}: ${fileAnalyses.length} files, categories: ${categories.join(", ")}`;
}
