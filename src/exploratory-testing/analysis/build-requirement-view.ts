import type {
  PersistedAllocationItem,
  PersistedChangeAnalysis,
  PersistedPrIntake,
  PersistedTestMapping,
} from "../db/workspace-repository";
import type {
  ChangeCategory,
  FileChangeAnalysis,
} from "../models/change-analysis";
import type { IntentContext } from "../models/intent-context";
import type { TestAsset } from "../models/test-mapping";
import { groupAllocationItems } from "./group-allocation-items";
import { isInfraConfig, isNonProductNoise } from "./is-product-relevant";

export type RequirementViewItem = {
  readonly requirement: string;
  readonly relatedTests: readonly string[];
  readonly sourceFiles: readonly string[];
  readonly automationCandidates: readonly string[];
};

export type ManualCheckItem = {
  readonly description: string;
  readonly reason: string;
};

export type HandoffViewModel = {
  readonly title: string;
  readonly requirements: readonly RequirementViewItem[];
  readonly testLayers: readonly string[];
  readonly manualChecks: readonly ManualCheckItem[];
  readonly notes: readonly string[];
};

export function buildHandoffViewModel(input: {
  readonly intentContext: IntentContext | null;
  readonly allocationItems: readonly PersistedAllocationItem[];
  readonly testMapping: PersistedTestMapping;
  readonly changeAnalysis: PersistedChangeAnalysis;
  readonly prIntake: PersistedPrIntake;
}): HandoffViewModel {
  const {
    intentContext,
    allocationItems,
    testMapping,
    changeAnalysis,
    prIntake,
  } = input;

  const productFileAnalyses = changeAnalysis.fileAnalyses.filter(
    (fa) => !isNonProductNoise(fa.path),
  );
  const productChangedFilePaths = prIntake.changedFiles
    .filter((file) => !isNonProductNoise(file.path))
    .map((file) => file.path);

  const requirements = deriveRequirements(
    intentContext,
    productFileAnalyses,
    productChangedFilePaths,
    testMapping.testAssets,
    allocationItems,
  );
  const testLayers = deriveDisplayTestLayers({
    testAssets: testMapping.testAssets,
    allocationItems,
    fileAnalyses: productFileAnalyses,
  });
  const grouped = groupAllocationItems(allocationItems);
  const manualChecks = deriveManualChecks(grouped);
  const notes = deriveNotes(intentContext, testMapping);

  return {
    title: prIntake.title,
    requirements,
    testLayers,
    manualChecks,
    notes,
  };
}

const DISPLAY_LAYER_MAP: ReadonlyArray<{
  readonly label: string;
  readonly check: (input: LayerCheckInput) => boolean;
}> = [
  {
    label: "単体テスト",
    check: (input) =>
      input.testAssetLayers.has("unit") ||
      input.allocationDestinations.has("unit"),
  },
  {
    label: "統合テスト",
    check: (input) =>
      input.allocationDestinations.has("integration") ||
      input.testAssetLayers.has("api"),
  },
  {
    label: "サービステスト",
    check: (input) =>
      input.fileCategories.has("api") ||
      input.fileCategories.has("cross-service") ||
      input.fileCategories.has("async"),
  },
  {
    label: "ビジュアルテスト",
    check: (input) =>
      input.testAssetLayers.has("visual") ||
      input.testAssetLayers.has("storybook") ||
      input.allocationDestinations.has("visual"),
  },
  {
    label: "E2Eテスト",
    check: (input) =>
      input.testAssetLayers.has("e2e") ||
      input.allocationDestinations.has("e2e"),
  },
];

type LayerCheckInput = {
  readonly testAssetLayers: ReadonlySet<string>;
  readonly allocationDestinations: ReadonlySet<string>;
  readonly fileCategories: ReadonlySet<string>;
};

export function deriveDisplayTestLayers(input: {
  readonly testAssets: readonly TestAsset[];
  readonly allocationItems: readonly PersistedAllocationItem[];
  readonly fileAnalyses: readonly FileChangeAnalysis[];
}): readonly string[] {
  const testAssetLayers = new Set(input.testAssets.map((a) => a.layer));
  const allocationDestinations = new Set(
    input.allocationItems.map((item) => item.recommendedDestination),
  );
  const fileCategories = new Set(
    input.fileAnalyses.flatMap((fa) => fa.categories.map((c) => c.category)),
  );

  const checkInput: LayerCheckInput = {
    testAssetLayers,
    allocationDestinations,
    fileCategories,
  };

  return DISPLAY_LAYER_MAP.filter((entry) => entry.check(checkInput)).map(
    (entry) => entry.label,
  );
}

function deriveRequirements(
  intentContext: IntentContext | null,
  fileAnalyses: readonly FileChangeAnalysis[],
  changedFilePaths: readonly string[],
  testAssets: readonly TestAsset[],
  allocationItems: readonly PersistedAllocationItem[],
): readonly RequirementViewItem[] {
  const rawRequirements = extractRawRequirements(
    intentContext,
    fileAnalyses,
    changedFilePaths,
  );

  return rawRequirements.map((req) => {
    const sourceFiles = matchSourceFiles(req, changedFilePaths);
    const relatedTests = findRelatedTests(sourceFiles, testAssets);
    const automationCandidates = findAutomationCandidates(
      sourceFiles,
      allocationItems,
    );
    return {
      requirement: req,
      relatedTests,
      sourceFiles,
      automationCandidates,
    };
  });
}

function extractRawRequirements(
  intentContext: IntentContext | null,
  fileAnalyses: readonly FileChangeAnalysis[],
  changedFilePaths: readonly string[],
): readonly string[] {
  // Primary: acceptance criteria
  if (
    intentContext?.acceptanceCriteria &&
    intentContext.acceptanceCriteria.length > 0
  ) {
    return intentContext.acceptanceCriteria;
  }

  // Secondary: userStory + changed files breakdown
  if (intentContext?.userStory) {
    return deriveRequirementsFromUserStory(
      intentContext.userStory,
      fileAnalyses,
    );
  }

  // Fallback: changed files + categories
  return deriveRequirementsFromFiles(fileAnalyses, changedFilePaths);
}

function deriveRequirementsFromUserStory(
  userStory: string,
  fileAnalyses: readonly FileChangeAnalysis[],
): readonly string[] {
  const requirements: string[] = [userStory];

  // Supplement with category-based observations
  const categoryGroups = groupFilesByCategory(fileAnalyses);
  for (const [category, files] of categoryGroups.entries()) {
    const label = CATEGORY_LABELS[category] ?? category;
    const prefix = deriveHumanReadableDir(files[0]);
    requirements.push(`${prefix} の ${label}`);
  }

  return requirements;
}

function deriveRequirementsFromFiles(
  fileAnalyses: readonly FileChangeAnalysis[],
  changedFilePaths: readonly string[],
): readonly string[] {
  const requirements: string[] = [];

  // Group by directory + category
  const categoryGroups = groupFilesByCategory(fileAnalyses);

  if (categoryGroups.size > 0) {
    for (const [category, files] of categoryGroups.entries()) {
      const label = CATEGORY_LABELS[category] ?? category;
      const prefix = deriveHumanReadableDir(files[0]);
      requirements.push(`${prefix} の ${label}`);
    }
  }

  // Add infra config as single group if present
  const infraFiles = changedFilePaths.filter((p) => isInfraConfig(p));
  if (infraFiles.length > 0) {
    requirements.push("インフラ設定変更");
  }

  // Uncategorized product files
  const categorizedPaths = new Set(
    fileAnalyses.filter((fa) => fa.categories.length > 0).map((fa) => fa.path),
  );
  const uncategorized = changedFilePaths.filter(
    (p) => !categorizedPaths.has(p) && !isInfraConfig(p),
  );
  if (uncategorized.length > 0 && requirements.length === 0) {
    for (const path of uncategorized.slice(0, 5)) {
      requirements.push(`${deriveHumanReadableDir(path)} の変更確認`);
    }
  }

  if (requirements.length === 0) {
    requirements.push("変更ファイルの動作確認");
  }

  return requirements;
}

function groupFilesByCategory(
  fileAnalyses: readonly FileChangeAnalysis[],
): Map<ChangeCategory, string[]> {
  const groups = new Map<ChangeCategory, string[]>();

  for (const fa of fileAnalyses) {
    if (fa.categories.length === 0) {
      continue;
    }
    // Use the first (highest-priority) category
    const primaryCategory = fa.categories[0].category;
    const list = groups.get(primaryCategory) ?? [];
    list.push(fa.path);
    groups.set(primaryCategory, list);
  }

  return groups;
}

const CATEGORY_LABELS: Partial<Record<ChangeCategory, string>> = {
  ui: "UI コンポーネント",
  api: "API エンドポイント",
  validation: "バリデーション",
  "state-transition": "状態遷移",
  permission: "権限制御",
  async: "非同期処理",
  schema: "スキーマ変更",
  "shared-component": "共通コンポーネント",
  "feature-flag": "フィーチャーフラグ",
  "cross-service": "サービス連携",
};

function deriveHumanReadableDir(filePath: string): string {
  const segments = filePath.split("/");
  // Take up to 3 meaningful segments, skip common prefixes
  const meaningful = segments.filter(
    (s) => s !== "src" && s !== "app" && s !== "lib" && s !== ".",
  );
  if (meaningful.length >= 2) {
    return meaningful.slice(0, 2).join("/");
  }
  if (meaningful.length === 1) {
    return meaningful[0];
  }
  return segments.slice(0, 2).join("/");
}

function matchSourceFiles(
  requirement: string,
  changedFilePaths: readonly string[],
): readonly string[] {
  const reqLower = requirement.toLowerCase();
  const matched = changedFilePaths.filter((path) => {
    const pathParts = path.toLowerCase().split("/");
    return pathParts.some(
      (part) =>
        reqLower.includes(part.replace(/\.[^.]+$/, "")) && part.length >= 3,
    );
  });

  if (matched.length > 0) {
    return matched;
  }

  // No strong match found — omit source files rather than flooding with all files
  return [];
}

function findRelatedTests(
  sourceFiles: readonly string[],
  testAssets: readonly TestAsset[],
): readonly string[] {
  const sourceSet = new Set(sourceFiles);
  const tests: string[] = [];

  for (const asset of testAssets) {
    if (asset.relatedTo.some((rel) => sourceSet.has(rel))) {
      tests.push(asset.path);
    }
  }

  return [...new Set(tests)];
}

function findAutomationCandidates(
  sourceFiles: readonly string[],
  allocationItems: readonly PersistedAllocationItem[],
): readonly string[] {
  const sourceSet = new Set(sourceFiles);
  const automationDestinations = new Set([
    "unit",
    "integration",
    "e2e",
    "visual",
  ]);
  const candidates: string[] = [];

  for (const item of allocationItems) {
    if (
      automationDestinations.has(item.recommendedDestination) &&
      item.changedFilePaths.some((p) => sourceSet.has(p))
    ) {
      candidates.push(
        `${item.recommendedDestination}: ${item.changedFilePaths[0]}`,
      );
    }
  }

  return [...new Set(candidates)];
}

function deriveManualChecks(
  grouped: ReturnType<typeof groupAllocationItems>,
): readonly ManualCheckItem[] {
  const checks: ManualCheckItem[] = [];

  for (const group of grouped) {
    if (
      group.destination !== "manual-exploration" &&
      group.destination !== "dev-box"
    ) {
      continue;
    }

    const detail = group.items[0]?.sourceSignals.manualExplorationDetail;
    if (detail) {
      checks.push({
        description: `${detail.targetSurface}: ${detail.whatToObserve}`,
        reason: detail.whyManual,
      });
    } else {
      checks.push({
        description: group.mergedTitle,
        reason: group.mergedRationale,
      });
    }
  }

  return checks;
}

function deriveNotes(
  intentContext: IntentContext | null,
  testMapping: PersistedTestMapping,
): readonly string[] {
  const notes: string[] = [];

  // notesForQa go to notes (not requirements)
  if (intentContext?.notesForQa && intentContext.notesForQa.length > 0) {
    for (const note of intentContext.notesForQa) {
      notes.push(note);
    }
  }

  // Missing layers
  if (testMapping.missingLayers.length > 0) {
    notes.push(`テストレイヤー未整備: ${testMapping.missingLayers.join(", ")}`);
  }

  return notes;
}
