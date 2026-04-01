import type { FileChangeAnalysis } from "../models/change-analysis";
import type {
  CoverageAspect,
  CoverageGapEntry,
  ExplorationPriority,
  TestAsset,
  TestLayer,
  TestSummary,
} from "../models/test-mapping";

const ALL_ASPECTS: readonly CoverageAspect[] = [
  "happy-path",
  "error-path",
  "boundary",
  "permission",
  "state-transition",
  "mock-fixture",
];

const ALL_LAYERS: readonly TestLayer[] = [
  "unit",
  "e2e",
  "visual",
  "storybook",
  "api",
];

export function buildCoverageGapMap(
  fileAnalyses: readonly FileChangeAnalysis[],
  testAssets: readonly TestAsset[],
  testSummaries: readonly TestSummary[],
): readonly CoverageGapEntry[] {
  const assetsByFile = new Map<string, TestAsset[]>();
  for (const asset of testAssets) {
    for (const filePath of asset.relatedTo) {
      const list = assetsByFile.get(filePath) ?? [];
      list.push(asset);
      assetsByFile.set(filePath, list);
    }
  }

  const summariesByAsset = new Map<string, TestSummary[]>();
  for (const summary of testSummaries) {
    const list = summariesByAsset.get(summary.testAssetPath) ?? [];
    list.push(summary);
    summariesByAsset.set(summary.testAssetPath, list);
  }

  const entries: CoverageGapEntry[] = [];

  for (const file of fileAnalyses) {
    const relatedAssets = assetsByFile.get(file.path) ?? [];
    const relatedSummaries = relatedAssets.flatMap(
      (a) => summariesByAsset.get(a.path) ?? [],
    );

    for (const aspect of ALL_ASPECTS) {
      const coveringTests = relatedSummaries
        .filter((s) => s.coveredAspects.includes(aspect))
        .map((s) => s.testAssetPath);

      // "partial" is reserved for the assess-gaps step, which enriches
      // test summaries by reading actual test content and may upgrade
      // entries from "uncovered" to "partial" when some aspects are
      // only superficially covered.
      const status = coveringTests.length > 0 ? "covered" : "uncovered";
      const explorationPriority = derivePriority(status);

      entries.push({
        changedFilePath: file.path,
        aspect,
        status,
        coveredBy: coveringTests,
        explorationPriority,
      });
    }
  }

  return entries;
}

export function detectMissingLayers(
  testAssets: readonly TestAsset[],
): readonly TestLayer[] {
  const presentLayers = new Set(testAssets.map((a) => a.layer));
  return ALL_LAYERS.filter((layer) => !presentLayers.has(layer));
}

function derivePriority(
  status: "covered" | "uncovered" | "partial",
): ExplorationPriority {
  switch (status) {
    case "covered":
      return "low";
    case "partial":
      return "medium";
    case "uncovered":
      return "high";
  }
}
