import type { AllocationDestination } from "../models/allocation";
import type { FileChangeAnalysis } from "../models/change-analysis";

export const LAYER_APPLICABILITY_LAYERS = [
  "unit",
  "integration-service",
  "ui-e2e",
  "visual",
  "manual-exploration",
] as const;

export type LayerApplicabilityLayer =
  (typeof LAYER_APPLICABILITY_LAYERS)[number];

export type LayerApplicabilityStatus =
  | "primary"
  | "secondary"
  | "not-primary"
  | "no-product-change";

export type LayerApplicabilityEntry = {
  readonly layer: LayerApplicabilityLayer;
  readonly status: LayerApplicabilityStatus;
  readonly reason: string;
};

export type LayerApplicabilityAssessment = Record<
  LayerApplicabilityLayer,
  LayerApplicabilityEntry
>;

type InputAllocationItem = {
  readonly recommendedDestination: AllocationDestination;
};

export type AssessLayerApplicabilityInput = {
  readonly changedFilePaths: readonly string[];
  readonly fileAnalyses: readonly FileChangeAnalysis[];
  readonly allocationItems: readonly InputAllocationItem[];
};

export function assessLayerApplicability(
  input: AssessLayerApplicabilityInput,
): LayerApplicabilityAssessment {
  const signals = collectSignals(input);

  if (signals.hasOnlyNonProductFiles) {
    const reason =
      "docs / test / story だけの差分で、プロダクト挙動を直接変える変更ではありません。";
    return {
      unit: entry("unit", "no-product-change", reason),
      "integration-service": entry(
        "integration-service",
        "no-product-change",
        reason,
      ),
      "ui-e2e": entry("ui-e2e", "no-product-change", reason),
      visual: entry("visual", "no-product-change", reason),
      "manual-exploration": entry(
        "manual-exploration",
        "no-product-change",
        reason,
      ),
    };
  }

  return {
    unit: assessUnitLayer(signals),
    "integration-service": assessIntegrationLayer(signals),
    "ui-e2e": assessUiE2eLayer(signals),
    visual: assessVisualLayer(signals),
    "manual-exploration": assessManualLayer(signals),
  };
}

type ApplicabilitySignals = {
  readonly hasOnlyNonProductFiles: boolean;
  readonly hasUiSource: boolean;
  readonly hasUiComponentSource: boolean;
  readonly hasUiFlowSource: boolean;
  readonly hasStaticAssetOnly: boolean;
  readonly hasStaticAsset: boolean;
  readonly hasServiceBoundary: boolean;
  readonly hasDeterministicLogic: boolean;
  readonly hasPermissionOrFlag: boolean;
  readonly hasMixedUiAndBackend: boolean;
  readonly allocationDestinations: ReadonlySet<AllocationDestination>;
};

function collectSignals(
  input: AssessLayerApplicabilityInput,
): ApplicabilitySignals {
  const productFiles = input.changedFilePaths.filter(
    (path) => !isNonProduct(path),
  );
  const sourceFiles = productFiles.filter((path) => !isStaticAsset(path));
  const categories = new Set(
    input.fileAnalyses.flatMap((analysis) =>
      analysis.categories.map((category) => category.category),
    ),
  );
  const allocationDestinations = new Set(
    input.allocationItems.map((item) => item.recommendedDestination),
  );

  const hasUiSource =
    sourceFiles.some((path) => isUiSource(path)) || categories.has("ui");
  const hasUiComponentSource = sourceFiles.some((path) =>
    isUiComponentSource(path),
  );
  const hasUiFlowSource = sourceFiles.some((path) => isUiFlowSource(path));
  const hasStaticAsset = productFiles.some((path) => isStaticAsset(path));
  const hasStaticAssetOnly =
    productFiles.length > 0 && productFiles.every(isStaticAsset);
  const hasServiceBoundary =
    categories.has("api") ||
    categories.has("async") ||
    categories.has("schema") ||
    categories.has("cross-service");
  const hasDeterministicLogic =
    categories.has("validation") ||
    categories.has("state-transition") ||
    categories.has("shared-component");
  const hasPermissionOrFlag =
    categories.has("permission") || categories.has("feature-flag");
  const hasMixedUiAndBackend =
    hasUiSource && (hasServiceBoundary || hasPermissionOrFlag);

  return {
    hasOnlyNonProductFiles: productFiles.length === 0,
    hasUiSource,
    hasUiComponentSource,
    hasUiFlowSource,
    hasStaticAssetOnly,
    hasStaticAsset,
    hasServiceBoundary,
    hasDeterministicLogic,
    hasPermissionOrFlag,
    hasMixedUiAndBackend,
    allocationDestinations,
  };
}

function assessUnitLayer(
  signals: ApplicabilitySignals,
): LayerApplicabilityEntry {
  if (signals.allocationDestinations.has("unit")) {
    return entry(
      "unit",
      "primary",
      "allocation でも unit に寄っており、今回の変更で局所的に固定しやすいロジックがあります。",
    );
  }

  if (
    signals.hasUiComponentSource &&
    !signals.hasUiFlowSource &&
    !signals.hasServiceBoundary
  ) {
    return entry(
      "unit",
      "primary",
      "UI component / local state 中心の変更で、局所ロジックや props ごとの振る舞いを unit で確認しやすい構成です。",
    );
  }

  if (signals.hasDeterministicLogic) {
    return entry(
      "unit",
      "secondary",
      "validation / state-transition / shared logic があり、unit で固定すると有効ですが主戦場は別 layer の可能性があります。",
    );
  }

  if (signals.hasStaticAssetOnly) {
    return entry(
      "unit",
      "not-primary",
      "static asset / PDF 差し替え中心で、unit で保証すべきロジック変更は主に見えていません。",
    );
  }

  return entry(
    "unit",
    "not-primary",
    "今回の変更では unit が主要な保証レイヤーだと示す signal は強くありません。",
  );
}

function assessIntegrationLayer(
  signals: ApplicabilitySignals,
): LayerApplicabilityEntry {
  if (signals.allocationDestinations.has("integration")) {
    return entry(
      "integration-service",
      "primary",
      "allocation でも integration に寄っており、service boundary や非同期連携の確認が主要対象です。",
    );
  }

  if (signals.hasServiceBoundary) {
    return entry(
      "integration-service",
      "primary",
      "API / schema / async / cross-service の signal があり、service boundary を跨ぐ検証が主保証先です。",
    );
  }

  if (signals.hasPermissionOrFlag) {
    return entry(
      "integration-service",
      "secondary",
      "permission / feature flag は runtime 組み合わせで効くことがあり、補助的に integration-service が意味を持ちます。",
    );
  }

  if (signals.hasUiSource || signals.hasStaticAssetOnly) {
    return entry(
      "integration-service",
      "not-primary",
      "今回の差分は UI / asset 中心で、service boundary を跨ぐ変更 signal は強くありません。",
    );
  }

  return entry(
    "integration-service",
    "not-primary",
    "今回の変更では integration / service test が主要対象だと示す signal は限定的です。",
  );
}

function assessUiE2eLayer(
  signals: ApplicabilitySignals,
): LayerApplicabilityEntry {
  if (signals.allocationDestinations.has("e2e")) {
    return entry(
      "ui-e2e",
      "primary",
      "allocation でも e2e に寄っており、主要ユーザーフローの通し確認が必要です。",
    );
  }

  if (signals.hasUiFlowSource) {
    return entry(
      "ui-e2e",
      "primary",
      "page / route / screen の変更があり、ユーザーフロー単位での確認が主要対象です。",
    );
  }

  if (signals.hasUiSource) {
    return entry(
      "ui-e2e",
      "secondary",
      "UI 変更はありますが flow path の変更は主ではなく、e2e は補助的な位置づけです。",
    );
  }

  if (signals.hasStaticAssetOnly) {
    return entry(
      "ui-e2e",
      "not-primary",
      "static asset / PDF 差し替え中心で、主要ユーザーフローの通し検証は主対象ではありません。",
    );
  }

  return entry(
    "ui-e2e",
    "not-primary",
    "今回の変更では UI / E2E が主要対象だと示す signal は強くありません。",
  );
}

function assessVisualLayer(
  signals: ApplicabilitySignals,
): LayerApplicabilityEntry {
  if (signals.allocationDestinations.has("visual")) {
    return entry(
      "visual",
      "primary",
      "allocation でも visual に寄っており、見た目やレンダリング差分の確認が主要対象です。",
    );
  }

  if (signals.hasStaticAssetOnly) {
    return entry(
      "visual",
      "primary",
      "static asset / PDF 差し替え中心のため、見た目や出力結果の spot-check が主要対象です。",
    );
  }

  if (signals.hasStaticAsset) {
    return entry(
      "visual",
      "secondary",
      "static asset / PDF の変更が含まれており、補助的に見た目の確認が有効です。",
    );
  }

  if (signals.hasUiSource) {
    return entry(
      "visual",
      "primary",
      "UI component / style 変更があり、見た目やレイアウトの確認が主要対象です。",
    );
  }

  if (signals.hasServiceBoundary || signals.hasPermissionOrFlag) {
    return entry(
      "visual",
      "not-primary",
      "今回の変更は backend / runtime behavior 中心で、visual regression は主要対象ではありません。",
    );
  }

  return entry(
    "visual",
    "not-primary",
    "今回の変更では visual が主要対象だと示す signal は強くありません。",
  );
}

function assessManualLayer(
  signals: ApplicabilitySignals,
): LayerApplicabilityEntry {
  if (
    signals.allocationDestinations.has("manual-exploration") ||
    signals.allocationDestinations.has("dev-box")
  ) {
    return entry(
      "manual-exploration",
      "primary",
      "allocation で manual remainder が残っており、曖昧さや状態依存の確認が必要です。",
    );
  }

  if (signals.hasStaticAssetOnly) {
    return entry(
      "manual-exploration",
      "secondary",
      "static asset / PDF 差し替えでは、人手の spot-check が補助的に有効です。",
    );
  }

  if (signals.hasPermissionOrFlag || signals.hasMixedUiAndBackend) {
    return entry(
      "manual-exploration",
      "secondary",
      "runtime 条件や横断的な振る舞いは、必要に応じて手動確認が補助的に有効です。",
    );
  }

  return entry(
    "manual-exploration",
    "not-primary",
    "今回の変更では manual exploration を主保証先にする強い remainder signal は見えていません。",
  );
}

function entry(
  layer: LayerApplicabilityLayer,
  status: LayerApplicabilityStatus,
  reason: string,
): LayerApplicabilityEntry {
  return { layer, status, reason };
}

function isUiSource(path: string): boolean {
  const isUiExt = /\.(tsx|jsx|vue|css|scss|sass|less|styl)$/i.test(path);
  const isUiDir =
    /\/(components|views|pages|layouts|routes|screens|flows)\//i.test(path) &&
    /\.[jt]sx?$/i.test(path);

  return isUiExt || isUiDir;
}

function isUiComponentSource(path: string): boolean {
  return (
    /\.(tsx|jsx|vue)$/i.test(path) || /\/(components|widgets|ui)\//i.test(path)
  );
}

function isUiFlowSource(path: string): boolean {
  const isFlowDir = /\/(pages|views|routes|screens|flows)\//i.test(path);
  const hasFlowKeyword = /(?:checkout|login|signup|cart|profile)/i.test(path);

  return (isFlowDir || hasFlowKeyword) && isUiSource(path);
}

function isStaticAsset(path: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|avif|ico|bmp|tiff?|svg)$/i.test(path);
}

function isNonProduct(path: string): boolean {
  return isDocLike(path) || isTestLike(path) || isStoryLike(path);
}

function isDocLike(path: string): boolean {
  return (
    /(^|\/)(docs?|adr|design)\//i.test(path) ||
    /(^|\/)(readme|changelog|contributing|license)(\.[^.]+)?$/i.test(path) ||
    /\.(md|mdx|txt|rst)$/i.test(path)
  );
}

function isTestLike(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?|e2e|cypress|playwright)\//i.test(path) ||
    /\.(test|spec)\.[^.]+$/i.test(path)
  );
}

function isStoryLike(path: string): boolean {
  return /\.stories\.(ts|tsx|js|jsx|mdx)$/i.test(path);
}
