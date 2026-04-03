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
import { escapePipe } from "../lib/markdown";
import type { ChangeCategory } from "../models/change-analysis";
import type { ResolvedPluginConfig } from "../models/config";
import type {
  CoverageAspect,
  TestAsset,
  TestMappingResult,
  TestSummary,
} from "../models/test-mapping";
import { readPluginConfig } from "./config";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

export type MapTestsInput = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type MapTestsResult = {
  readonly persisted: PersistedTestMapping;
  readonly handover: StepHandoverWriteResult;
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
      `PR intake not found for ${input.provider}/${input.repository}#${input.prNumber}. Run pr-intake first.`,
    );
  }

  const changeAnalysis = findChangeAnalysis(config.paths.database, prIntake.id);

  if (!changeAnalysis) {
    throw new Error(
      `Change analysis not found for pr_intake_id=${prIntake.id}. Run discover-context first.`,
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
  const body = buildHandoverBody(persisted);

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "map-tests",
    status: "completed",
    summary: `Mapped ${testAssets.length} test assets, ${coverageGapMap.length} gap entries, ${missingLayers.length} missing layers`,
    body,
  });

  return { persisted, handover };
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

function buildHandoverBody(mapping: PersistedTestMapping): string {
  const lines = [
    `# Test Mapping (change_analysis_id: ${mapping.changeAnalysisId})`,
    "",
    "## Test Assets",
    "",
    "| Path | Layer | Related To | Confidence |",
    "| --- | --- | --- | --- |",
  ];

  for (const asset of mapping.testAssets) {
    lines.push(
      `| ${escapePipe(asset.path)} | ${asset.layer} | ${asset.relatedTo.map(escapePipe).join(", ")} | ${asset.confidence} |`,
    );
  }
  lines.push("");

  if (mapping.missingLayers.length > 0) {
    lines.push(
      "## Missing Test Layers",
      "",
      `The following test layers have no candidates: **${mapping.missingLayers.join(", ")}**`,
      "",
    );
  }

  lines.push(
    "## Coverage Gap Map",
    "",
    "| Changed File | Aspect | Status | Covered By | Priority |",
    "| --- | --- | --- | --- | --- |",
  );

  for (const gap of mapping.coverageGapMap) {
    const coveredBy =
      gap.coveredBy.length > 0 ? gap.coveredBy.map(escapePipe).join(", ") : "—";
    lines.push(
      `| ${escapePipe(gap.changedFilePath)} | ${gap.aspect} | ${gap.status} | ${coveredBy} | ${gap.explorationPriority} |`,
    );
  }
  lines.push("");

  const highPriority = mapping.coverageGapMap.filter(
    (g) => g.explorationPriority === "high",
  );

  if (highPriority.length > 0) {
    lines.push("## High Priority Gaps (Manual Exploration Focus)", "");

    for (const gap of highPriority) {
      lines.push(
        `- **${escapePipe(gap.changedFilePath)}**: ${gap.aspect} (${gap.status})`,
      );
    }
    lines.push("");
  }

  lines.push("## Next step", "", "- assess-gaps", "");

  return lines.join("\n");
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
