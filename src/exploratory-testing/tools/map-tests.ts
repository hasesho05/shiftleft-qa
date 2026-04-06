import {
  buildCoverageGapMap,
  detectMissingLayers,
} from "../analysis/build-coverage-gap-map";
import { findTestAssets } from "../analysis/find-test-files";
import {
  type PersistedChangeAnalysis,
  type PersistedPrIntake,
  type PersistedTestMapping,
  findChangeAnalysis,
  findPrIntake,
  saveTestMapping,
} from "../db/workspace-repository";
import type { ChangeCategory } from "../models/change-analysis";
import type { ResolvedPluginConfig } from "../models/config";
import type {
  CoverageAspect,
  TestAsset,
  TestMappingResult,
  TestSummary,
} from "../models/test-mapping";
import { readPluginConfig } from "./config";

export type MapTestsInput = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type MapTestsResult = {
  readonly persisted: PersistedTestMapping;
};

export async function runMapTests(
  input: MapTestsInput,
): Promise<MapTestsResult> {
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

  const changeAnalysis = findChangeAnalysis(config.paths.database, prIntake.id);

  if (!changeAnalysis) {
    throw new Error(
      `Change analysis not found for pr_intake_id=${prIntake.id}. Run analyze-pr first.`,
    );
  }

  return runMapTestsFromAnalysis(changeAnalysis, prIntake, config);
}

export async function runMapTestsFromAnalysis(
  changeAnalysis: PersistedChangeAnalysis,
  prIntake: PersistedPrIntake,
  config: ResolvedPluginConfig,
): Promise<MapTestsResult> {
  const testAssets = findTestAssets(prIntake.changedFiles);
  const testSummaries = buildInitialTestSummaries(
    testAssets,
    changeAnalysis.fileAnalyses,
  );
  const coverageGapMap = buildCoverageGapMap(
    changeAnalysis.fileAnalyses,
    testAssets,
    testSummaries,
  );
  const missingLayers = detectMissingLayers(testAssets);

  const mappingResult: TestMappingResult = {
    prIntakeId: prIntake.id,
    changeAnalysisId: changeAnalysis.id,
    testAssets: [...testAssets],
    testSummaries: [...testSummaries],
    coverageGapMap: [...coverageGapMap],
    missingLayers: [...missingLayers],
    mappedAt: new Date().toISOString(),
  };

  const persisted = saveTestMapping(config.paths.database, mappingResult);

  return { persisted };
}

function buildInitialTestSummaries(
  testAssets: readonly TestAsset[],
  fileAnalyses: PersistedChangeAnalysis["fileAnalyses"],
): readonly TestSummary[] {
  const categoriesByFile = new Map(
    fileAnalyses.map((analysis) => [
      analysis.path,
      analysis.categories.map((category) => category.category),
    ]),
  );

  return testAssets.map((asset) => {
    const coveredAspects = inferCoveredAspects(asset, categoriesByFile);
    return {
      testAssetPath: asset.path,
      layer: asset.layer,
      coveredAspects,
      coverageConfidence: "inferred",
      description: `Heuristic ${asset.layer} candidate for ${asset.relatedTo.join(", ")}`,
    };
  });
}

function inferCoveredAspects(
  asset: TestAsset,
  categoriesByFile: ReadonlyMap<string, readonly ChangeCategory[]>,
): CoverageAspect[] {
  const aspects = new Set<CoverageAspect>();

  switch (asset.layer) {
    case "unit":
      aspects.add("happy-path");
      aspects.add("error-path");
      break;
    case "e2e":
      aspects.add("happy-path");
      aspects.add("error-path");
      aspects.add("state-transition");
      break;
    case "visual":
    case "storybook":
      aspects.add("happy-path");
      break;
    case "api":
      aspects.add("happy-path");
      aspects.add("error-path");
      aspects.add("boundary");
      break;
  }

  for (const relatedFile of asset.relatedTo) {
    const categories = categoriesByFile.get(relatedFile) ?? [];

    if (
      categories.some((category) =>
        ["validation", "api", "schema", "ui"].includes(category),
      )
    ) {
      aspects.add("boundary");
    }
    if (
      categories.some((category) =>
        ["permission", "feature-flag"].includes(category),
      )
    ) {
      aspects.add("permission");
    }
    if (
      categories.some((category) =>
        ["state-transition", "async", "feature-flag"].includes(category),
      )
    ) {
      aspects.add("state-transition");
    }
    if (
      categories.some((category) =>
        [
          "async",
          "cross-service",
          "schema",
          "shared-component",
          "api",
        ].includes(category),
      )
    ) {
      aspects.add("mock-fixture");
    }
  }

  return [...aspects];
}
