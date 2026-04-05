import type { FileChangeAnalysis } from "../models/change-analysis";
import type {
  CoverageAspect,
  CoverageConfidence,
  CoverageGapEntry,
  CoverageStatus,
  ExplorationPriority,
  StabilityStatus,
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

  const stabilityByAsset = new Map<string, TestAsset>();
  for (const asset of testAssets) {
    stabilityByAsset.set(asset.path, asset);
  }

  const entries: CoverageGapEntry[] = [];

  for (const file of fileAnalyses) {
    const relatedAssets = assetsByFile.get(file.path) ?? [];
    const relatedSummaries = relatedAssets.flatMap(
      (a) => summariesByAsset.get(a.path) ?? [],
    );
    const applicableAspects = getApplicableAspects(file);

    for (const aspect of applicableAspects) {
      const confirmedCoverage = getCoveringTests(
        relatedSummaries,
        aspect,
        "confirmed",
      );
      const inferredCoverage = getCoveringTests(
        relatedSummaries,
        aspect,
        "inferred",
      );
      let status: CoverageStatus =
        confirmedCoverage.length > 0
          ? "covered"
          : inferredCoverage.length > 0
            ? "partial"
            : "uncovered";
      const coveredBy =
        status === "covered"
          ? confirmedCoverage
          : status === "partial"
            ? inferredCoverage
            : [];

      const stabilityNotes = collectStabilityNotes(coveredBy, stabilityByAsset);

      if (stabilityNotes.length > 0 && status === "covered") {
        const hasStableConfirmed = coveredBy.some((testPath) => {
          const asset = stabilityByAsset.get(testPath);
          return asset !== undefined && !isUnstable(asset.stability);
        });
        if (!hasStableConfirmed) {
          status = "partial";
        }
      }

      const explorationPriority = derivePriority(status);

      entries.push({
        changedFilePath: file.path,
        aspect,
        status,
        coveredBy,
        explorationPriority,
        stabilityNotes,
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

function getCoveringTests(
  summaries: readonly TestSummary[],
  aspect: CoverageAspect,
  confidence: CoverageConfidence,
): string[] {
  return summaries
    .filter(
      (summary) =>
        summary.coveredAspects.includes(aspect) &&
        summary.coverageConfidence === confidence,
    )
    .map((summary) => summary.testAssetPath);
}

function getApplicableAspects(
  file: FileChangeAnalysis,
): readonly CoverageAspect[] {
  const aspects = new Set<CoverageAspect>(["happy-path", "error-path"]);
  const categories = new Set(
    file.categories.map((category) => category.category),
  );

  if (hasAnyCategory(categories, ["validation", "api", "schema", "ui"])) {
    aspects.add("boundary");
  }

  if (hasAnyCategory(categories, ["permission", "feature-flag"])) {
    aspects.add("permission");
  }

  if (
    hasAnyCategory(categories, ["state-transition", "async", "feature-flag"])
  ) {
    aspects.add("state-transition");
  }

  if (
    hasAnyCategory(categories, [
      "async",
      "cross-service",
      "schema",
      "shared-component",
      "api",
    ])
  ) {
    aspects.add("mock-fixture");
  }

  if (aspects.size === 2 && file.categories.length === 0) {
    return ALL_ASPECTS;
  }

  return [...aspects];
}

function isUnstable(stability: StabilityStatus | undefined): boolean {
  return stability === "flaky" || stability === "quarantined";
}

function collectStabilityNotes(
  coveringTestPaths: readonly string[],
  assetsByPath: ReadonlyMap<string, TestAsset>,
): string[] {
  const notes: string[] = [];
  const seen = new Set<string>();

  for (const testPath of coveringTestPaths) {
    if (seen.has(testPath)) {
      continue;
    }
    seen.add(testPath);

    const asset = assetsByPath.get(testPath);
    if (!asset || !isUnstable(asset.stability)) {
      continue;
    }

    const label = asset.stability === "quarantined" ? "quarantined" : "flaky";
    const signalDesc =
      asset.stabilitySignals.length > 0
        ? ` (${asset.stabilitySignals.join(", ")})`
        : "";
    notes.push(`${testPath}: ${label}${signalDesc}`);
  }

  return notes;
}

function hasAnyCategory(
  categories: ReadonlySet<FileChangeAnalysis["categories"][number]["category"]>,
  targets: readonly FileChangeAnalysis["categories"][number]["category"][],
): boolean {
  return targets.some((target) => categories.has(target));
}
