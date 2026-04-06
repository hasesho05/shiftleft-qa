import {
  type PersistedAllocationItem,
  countAllocationItemsByDestination,
  findChangeAnalysisById,
  findPrIntakeById,
  findRiskAssessmentById,
  findTestMappingById,
  listAllocationItems,
  saveAllocationItems,
} from "../db/workspace-repository";
import type { PersistedChangeAnalysis } from "../db/workspace-repository";
import type { PersistedPrIntake } from "../db/workspace-repository";
import type { PersistedRiskAssessment } from "../db/workspace-repository";
import type { PersistedTestMapping } from "../db/workspace-repository";
import {
  ALLOCATION_DESTINATIONS,
  type AllocationDestination,
  type AllocationDestinationCounts,
  type AllocationItem,
  createEmptyAllocationDestinationCounts,
} from "../models/allocation";
import type { ChangeCategory } from "../models/change-analysis";
import type { ResolvedPluginConfig } from "../models/config";
import type {
  CoverageAspect,
  CoverageGapEntry,
  ExplorationPriority,
  TestLayer,
} from "../models/test-mapping";
import { readPluginConfig } from "./config";

export type AllocateInput = {
  readonly riskAssessmentId: number;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type AllocationContext = {
  readonly riskAssessment: PersistedRiskAssessment;
  readonly testMapping: PersistedTestMapping;
  readonly changeAnalysis: PersistedChangeAnalysis;
  readonly prIntake: PersistedPrIntake;
};

export type AllocateResult = {
  readonly riskAssessmentId: number;
  readonly items: readonly PersistedAllocationItem[];
  readonly destinationCounts: AllocationDestinationCounts;
};

export type ListAllocationResult = {
  readonly riskAssessmentId: number;
  readonly items: readonly PersistedAllocationItem[];
  readonly destinationCounts: AllocationDestinationCounts;
};

export type AllocationRepresentativeItem = {
  readonly destination: AllocationDestination;
  readonly title: string;
  readonly riskLevel: ExplorationPriority;
  readonly confidence: number;
};

export type AllocationSummary = {
  readonly riskAssessmentId: number;
  readonly totalItems: number;
  readonly destinationCounts: AllocationDestinationCounts;
  readonly representativeItems: readonly AllocationRepresentativeItem[];
};

const DESTINATION_ORDER = new Map(
  ALLOCATION_DESTINATIONS.map(
    (destination, index) => [destination, index] as const,
  ),
);

export async function runAllocate(
  input: AllocateInput,
): Promise<AllocateResult> {
  const config = await readPluginConfig(input.configPath, input.manifestPath);
  const context = resolveAllocationContext(config, input.riskAssessmentId);
  const items = buildAllocationItems(context);
  const persisted = saveAllocationItems(
    config.paths.database,
    input.riskAssessmentId,
    items,
  );

  const destinationCounts = countAllocationItemsByDestination(
    config.paths.database,
    input.riskAssessmentId,
  );

  return {
    riskAssessmentId: input.riskAssessmentId,
    items: persisted,
    destinationCounts,
  };
}

export async function listAllocation(
  input: AllocateInput,
): Promise<ListAllocationResult> {
  const config = await readPluginConfig(input.configPath, input.manifestPath);
  const items = listAllocationItems(
    config.paths.database,
    input.riskAssessmentId,
  );

  return {
    riskAssessmentId: input.riskAssessmentId,
    items,
    destinationCounts: countAllocationItemsByDestination(
      config.paths.database,
      input.riskAssessmentId,
    ),
  };
}

export async function summarizeAllocation(
  input: AllocateInput,
): Promise<AllocationSummary> {
  const listResult = await listAllocation(input);
  return summarizeAllocationItems(
    listResult.items,
    listResult.riskAssessmentId,
  );
}

export function buildAllocationItems(
  context: AllocationContext,
): readonly AllocationItem[] {
  const fileAnalysisByPath = new Map(
    context.changeAnalysis.fileAnalyses.map(
      (analysis) => [analysis.path, analysis] as const,
    ),
  );
  const gapsByFile = groupCoverageGapsByFile(
    context.testMapping.coverageGapMap,
  );
  const riskScoreByFile = new Map(
    context.riskAssessment.riskScores.map(
      (score) => [score.changedFilePath, score] as const,
    ),
  );

  const items: AllocationItem[] = [];

  for (const [filePath, fileAnalysis] of fileAnalysisByPath.entries()) {
    const gaps = gapsByFile.get(filePath) ?? [];
    const riskScore = riskScoreByFile.get(filePath) ?? null;
    const existingTestLayers = deriveExistingTestLayers(
      filePath,
      context.testMapping,
    );
    const reviewComments = deriveReviewComments(filePath, context.prIntake);

    for (const gap of gaps) {
      items.push(
        buildAllocationItem({
          riskAssessmentId: context.riskAssessment.id,
          fileAnalysis,
          gap,
          riskScore,
          existingTestLayers,
          reviewComments,
        }),
      );
    }
  }

  items.sort((a, b) => {
    const fileComparison = a.changedFilePaths[0].localeCompare(
      b.changedFilePaths[0],
    );
    if (fileComparison !== 0) {
      return fileComparison;
    }

    const destinationComparison =
      (DESTINATION_ORDER.get(a.recommendedDestination) ?? 0) -
      (DESTINATION_ORDER.get(b.recommendedDestination) ?? 0);

    if (destinationComparison !== 0) {
      return destinationComparison;
    }

    return a.title.localeCompare(b.title);
  });

  return items;
}

export function summarizeAllocationItems(
  items: readonly PersistedAllocationItem[],
  riskAssessmentId: number,
): AllocationSummary {
  const destinationCounts = countItemsByDestination(items);
  const representativeItems: AllocationRepresentativeItem[] = [];

  for (const destination of ALLOCATION_DESTINATIONS) {
    const item = items.find(
      (candidate) => candidate.recommendedDestination === destination,
    );
    if (!item) {
      continue;
    }

    representativeItems.push({
      destination,
      title: item.title,
      riskLevel: item.riskLevel,
      confidence: item.confidence,
    });
  }

  return {
    riskAssessmentId,
    totalItems: items.length,
    destinationCounts,
    representativeItems,
  };
}

function resolveAllocationContext(
  config: ResolvedPluginConfig,
  riskAssessmentId: number,
): AllocationContext {
  const riskAssessment = findRiskAssessmentById(
    config.paths.database,
    riskAssessmentId,
  );

  if (!riskAssessment) {
    throw new Error(
      `Risk assessment not found for id=${riskAssessmentId}. Run analyze-pr and design-handoff first.`,
    );
  }

  const testMapping = findTestMappingById(
    config.paths.database,
    riskAssessment.testMappingId,
  );

  if (!testMapping) {
    throw new Error(
      `Test mapping not found for id=${riskAssessment.testMappingId}. Run analyze-pr first.`,
    );
  }

  const changeAnalysis = findChangeAnalysisById(
    config.paths.database,
    testMapping.changeAnalysisId,
  );

  if (!changeAnalysis) {
    throw new Error(
      `Change analysis not found for id=${testMapping.changeAnalysisId}. Run analyze-pr first.`,
    );
  }

  const prIntake = findPrIntakeById(
    config.paths.database,
    testMapping.prIntakeId,
  );

  if (!prIntake) {
    throw new Error(
      `PR intake not found for id=${testMapping.prIntakeId}. Run analyze-pr first.`,
    );
  }

  return {
    riskAssessment,
    testMapping,
    changeAnalysis,
    prIntake,
  };
}

function groupCoverageGapsByFile(
  coverageGaps: readonly CoverageGapEntry[],
): Map<string, CoverageGapEntry[]> {
  const map = new Map<string, CoverageGapEntry[]>();

  for (const gap of coverageGaps) {
    const list = map.get(gap.changedFilePath) ?? [];
    list.push(gap);
    map.set(gap.changedFilePath, list);
  }

  return map;
}

function buildAllocationItem(input: {
  readonly riskAssessmentId: number;
  readonly fileAnalysis: AllocationContext["changeAnalysis"]["fileAnalyses"][number];
  readonly gap: CoverageGapEntry;
  readonly riskScore: PersistedRiskAssessment["riskScores"][number] | null;
  readonly existingTestLayers: readonly TestLayer[];
  readonly reviewComments: readonly string[];
}): AllocationItem {
  const categories = uniqueCategories(
    input.fileAnalysis.categories.map((category) => category.category),
  );
  const riskSignals = buildRiskSignals(
    input.fileAnalysis.path,
    [input.gap],
    input.riskScore,
    input.existingTestLayers,
    input.reviewComments,
  );
  const destination = decideDestination(
    input.fileAnalysis,
    input.gap,
    input.riskScore,
  );
  const riskLevel = deriveRiskLevel(input.riskScore, [input.gap]);

  const alternativeDestinations = deriveAlternativeDestinations(
    destination,
    input.fileAnalysis,
    input.gap,
    input.riskScore,
  );

  return {
    riskAssessmentId: input.riskAssessmentId,
    title: buildAllocationTitle(destination, input.fileAnalysis.path, [
      input.gap.aspect,
    ]),
    changedFilePaths: [input.fileAnalysis.path],
    riskLevel,
    recommendedDestination: destination,
    confidence: deriveConfidence(destination, [input.gap]),
    rationale: buildRationale(
      destination,
      input.fileAnalysis.path,
      [input.gap.aspect],
      riskSignals,
    ),
    sourceSignals: {
      categories,
      existingTestLayers: [...input.existingTestLayers],
      gapAspects: [input.gap.aspect],
      reviewComments: [...input.reviewComments],
      riskSignals,
      reasoningSummary: buildReasoningSummary(
        destination,
        categories,
        input.gap,
        input.riskScore,
      ),
      alternativeDestinations,
      openQuestions: deriveOpenQuestions(
        destination,
        input.gap,
        input.reviewComments,
      ),
      manualRemainder:
        destination === "manual-exploration"
          ? buildManualRemainder(input.fileAnalysis.path, input.gap, categories)
          : undefined,
    },
  };
}

function decideDestination(
  fileAnalysis: AllocationContext["changeAnalysis"]["fileAnalyses"][number],
  gap: CoverageGapEntry,
  riskScore: PersistedRiskAssessment["riskScores"][number] | null,
): AllocationDestination {
  const categories = new Set(
    fileAnalysis.categories.map((category) => category.category),
  );
  const riskLevel = deriveRiskLevel(riskScore, [gap]);

  if (gap.status === "covered") {
    return "skip";
  }

  if (hasAnyCategory(categories, ["permission", "feature-flag"])) {
    return "review";
  }

  if (hasAnyCategory(categories, ["validation", "state-transition"])) {
    return "unit";
  }

  if (hasAnyCategory(categories, ["api", "schema", "cross-service", "async"])) {
    return "integration";
  }

  if (hasAnyCategory(categories, ["ui"])) {
    return isFlowPath(fileAnalysis.path) ? "e2e" : "visual";
  }

  if (riskLevel === "low" && gap.aspect === "happy-path") {
    return "dev-box";
  }

  return "manual-exploration";
}

function deriveRiskLevel(
  riskScore: PersistedRiskAssessment["riskScores"][number] | null,
  gaps: readonly CoverageGapEntry[],
): ExplorationPriority {
  const scoreLevel = riskScore
    ? riskScore.overallRisk >= 0.66
      ? "high"
      : riskScore.overallRisk >= 0.33
        ? "medium"
        : "low"
    : "low";

  const gapLevel = gaps.reduce<ExplorationPriority>((current, gap) => {
    if (gap.explorationPriority === "high") {
      return "high";
    }
    if (gap.explorationPriority === "medium" && current === "low") {
      return "medium";
    }
    return current;
  }, "low");

  return compareRiskLevel(scoreLevel, gapLevel) >= 0 ? scoreLevel : gapLevel;
}

function compareRiskLevel(
  left: ExplorationPriority,
  right: ExplorationPriority,
): number {
  const order: Record<ExplorationPriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return order[left] - order[right];
}

function deriveConfidence(
  destination: AllocationDestination,
  gaps: readonly CoverageGapEntry[],
): number {
  if (destination === "skip") {
    return 0.95;
  }

  if (destination === "manual-exploration") {
    return gaps.some((gap) => gap.status === "partial") ? 0.55 : 0.35;
  }

  if (destination === "dev-box") {
    return 0.75;
  }

  return gaps.some((gap) => gap.status === "partial") ? 0.6 : 0.86;
}

function buildAllocationTitle(
  destination: AllocationDestination,
  filePath: string,
  gapAspects: readonly CoverageAspect[],
): string {
  const aspects = gapAspects.join(", ");

  switch (destination) {
    case "review":
      return `Review ${filePath} (${aspects})`;
    case "unit":
      return `Unit coverage for ${filePath} (${aspects})`;
    case "integration":
      return `Integration coverage for ${filePath} (${aspects})`;
    case "e2e":
      return `End-to-end coverage for ${filePath} (${aspects})`;
    case "visual":
      return `Visual coverage for ${filePath} (${aspects})`;
    case "dev-box":
      return `Dev-box smoke check for ${filePath} (${aspects})`;
    case "manual-exploration":
      return `Manual exploration for ${filePath} (${aspects})`;
    case "skip":
      return `Already covered for ${filePath} (${aspects})`;
  }
}

function buildRationale(
  destination: AllocationDestination,
  filePath: string,
  gapAspects: readonly CoverageAspect[],
  riskSignals: readonly string[],
): string {
  const aspects = gapAspects.join(", ");
  const signalSummary = riskSignals.slice(0, 3).join(", ");

  switch (destination) {
    case "review":
      return `Code review should verify ${filePath} before QA handoff. Signals: ${signalSummary}`;
    case "unit":
      return `Deterministic logic in ${filePath} should be pinned with unit tests. Signals: ${signalSummary}`;
    case "integration":
      return `Boundary behavior in ${filePath} is better covered with integration tests. Signals: ${signalSummary}`;
    case "e2e":
      return `Primary user flow in ${filePath} should be exercised end-to-end. Signals: ${signalSummary}`;
    case "visual":
      return `Rendering differences in ${filePath} are best covered by visual regression. Signals: ${signalSummary}`;
    case "dev-box":
      return `Implementer should run a quick smoke check for ${filePath} before QA handoff. Signals: ${signalSummary}`;
    case "manual-exploration":
      return `This remains a manual exploration topic because ${filePath} still has stateful or ambiguous risk. Aspects: ${aspects}`;
    case "skip":
      return `Existing confirmed tests already cover ${filePath}. Aspects: ${aspects}`;
  }
}

function buildRiskSignals(
  filePath: string,
  gaps: readonly CoverageGapEntry[],
  riskScore: PersistedRiskAssessment["riskScores"][number] | null,
  existingTestLayers: readonly TestLayer[],
  reviewComments: readonly string[],
): string[] {
  const signals: string[] = [];

  if (riskScore) {
    signals.push(`risk:${riskScore.overallRisk.toFixed(3)}`);
  }

  for (const gap of gaps) {
    signals.push(`gap:${gap.aspect}:${gap.status}`);
  }

  for (const layer of existingTestLayers) {
    signals.push(`layer:${layer}`);
  }

  for (const comment of reviewComments) {
    signals.push(`review:${comment}`);
  }

  if (signals.length === 0) {
    signals.push(`file:${filePath}`);
  }

  return signals;
}

function deriveExistingTestLayers(
  filePath: string,
  testMapping: PersistedTestMapping,
): readonly TestLayer[] {
  const relatedTestAssets = testMapping.testAssets.filter((asset) =>
    asset.relatedTo.includes(filePath),
  );
  const layers = new Set<TestLayer>();

  for (const asset of relatedTestAssets) {
    layers.add(asset.layer);
    for (const summary of testMapping.testSummaries) {
      if (summary.testAssetPath === asset.path) {
        layers.add(summary.layer);
      }
    }
  }

  return [...layers];
}

function deriveReviewComments(
  filePath: string,
  prIntake: PersistedPrIntake,
): readonly string[] {
  return prIntake.reviewComments
    .filter((comment) => comment.path === filePath)
    .map((comment) => `${comment.author}: ${comment.body}`);
}

function uniqueCategories(
  categories: readonly ChangeCategory[],
): ChangeCategory[] {
  return [...new Set(categories)];
}

function hasAnyCategory(
  categories: ReadonlySet<ChangeCategory>,
  targets: readonly ChangeCategory[],
): boolean {
  return targets.some((target) => categories.has(target));
}

function isFlowPath(filePath: string): boolean {
  return (
    /\/(pages|views|routes|screens|flows)\//i.test(filePath) ||
    /(?:checkout|login|signup|cart|profile)/i.test(filePath)
  );
}

function countItemsByDestination(
  items: readonly PersistedAllocationItem[],
): AllocationDestinationCounts {
  const counts = createEmptyAllocationDestinationCounts();

  for (const item of items) {
    counts[item.recommendedDestination] += 1;
  }

  return counts;
}

function buildReasoningSummary(
  destination: AllocationDestination,
  categories: readonly ChangeCategory[],
  gap: CoverageGapEntry,
  riskScore: PersistedRiskAssessment["riskScores"][number] | null,
): string {
  const categoryList =
    categories.length > 0 ? categories.join(", ") : "no specific category";
  const riskNote = riskScore
    ? `; risk=${riskScore.overallRisk.toFixed(2)}`
    : "";

  switch (destination) {
    case "skip":
      return `Gap aspect ${gap.aspect} is already covered${riskNote}.`;
    case "review":
      return `Category ${categoryList} triggers review destination${riskNote}.`;
    case "unit":
      return `Category ${categoryList} is deterministic and suitable for unit testing (${gap.aspect} gap)${riskNote}.`;
    case "integration":
      return `Category ${categoryList} involves service boundaries best covered by integration tests (${gap.aspect} gap)${riskNote}.`;
    case "e2e":
      return `UI component in a flow path requires end-to-end validation (${gap.aspect} gap)${riskNote}.`;
    case "visual":
      return `UI component outside flow paths is best covered by visual regression (${gap.aspect} gap)${riskNote}.`;
    case "dev-box":
      return `Low-risk ${gap.aspect} gap suitable for implementer smoke check${riskNote}.`;
    case "manual-exploration":
      return `No deterministic category matched; ${gap.aspect} gap remains ambiguous and requires human exploration${riskNote}.`;
  }
}

function deriveAlternativeDestinations(
  primary: AllocationDestination,
  fileAnalysis: AllocationContext["changeAnalysis"]["fileAnalyses"][number],
  gap: CoverageGapEntry,
  riskScore: PersistedRiskAssessment["riskScores"][number] | null,
): AllocationDestination[] {
  if (primary === "skip") {
    return [];
  }

  // Candidates are pushed in preference order: most specific first,
  // manual-exploration last (weakest alternative).
  const candidates: AllocationDestination[] = [];
  const categories = new Set(fileAnalysis.categories.map((c) => c.category));

  if (
    primary !== "review" &&
    hasAnyCategory(categories, ["permission", "feature-flag"])
  ) {
    candidates.push("review");
  }

  if (
    primary !== "unit" &&
    hasAnyCategory(categories, ["validation", "state-transition"])
  ) {
    candidates.push("unit");
  }

  if (
    primary !== "integration" &&
    hasAnyCategory(categories, ["api", "schema", "cross-service", "async"])
  ) {
    candidates.push("integration");
  }

  if (hasAnyCategory(categories, ["ui"])) {
    const preferred = isFlowPath(fileAnalysis.path) ? "e2e" : "visual";
    const other: AllocationDestination = preferred === "e2e" ? "visual" : "e2e";

    if (primary !== preferred) {
      candidates.push(preferred);
    }
    if (primary !== other) {
      candidates.push(other);
    }
  }

  if (
    primary !== "dev-box" &&
    riskScore &&
    riskScore.overallRisk < 0.33 &&
    gap.aspect === "happy-path"
  ) {
    candidates.push("dev-box");
  }

  // manual-exploration is the weakest alternative: append last
  if (primary !== "manual-exploration" && gap.status !== "covered") {
    candidates.push("manual-exploration");
  }

  // manual-exploration fallback: always offer dev-box as a minimum alternative
  if (primary === "manual-exploration" && candidates.length === 0) {
    candidates.push("dev-box");
  }

  // All pushes above are individually guarded by `primary !== <destination>`,
  // so no candidate can equal primary here.
  return candidates;
}

function deriveOpenQuestions(
  destination: AllocationDestination,
  gap: CoverageGapEntry,
  reviewComments: readonly string[],
): string[] {
  const questions: string[] = [];

  if (gap.status === "partial") {
    questions.push(
      `Gap aspect "${gap.aspect}" is only partially covered — what scenarios remain untested?`,
    );
  }

  if (gap.status === "uncovered" && gap.aspect === "error-path") {
    questions.push(
      "What error conditions can realistically occur in production?",
    );
  }

  if (gap.aspect === "permission") {
    questions.push(
      "Are all permission scenarios (roles, edge cases) accounted for?",
    );
  }

  if (gap.aspect === "state-transition") {
    questions.push(
      "Are there race conditions or ordering dependencies in state transitions?",
    );
  }

  if (reviewComments.length > 0) {
    questions.push(
      "Reviewer flagged concerns — have all review comments been addressed?",
    );
  }

  return questions;
}

function buildManualRemainder(
  filePath: string,
  gap: CoverageGapEntry,
  categories: readonly ChangeCategory[],
): string {
  const categoryNote =
    categories.length > 0
      ? `Categories (${categories.join(", ")}) did not match a deterministic destination.`
      : "No specific change category was identified.";

  return `${categoryNote} The ${gap.aspect} gap in ${filePath} requires human exploration because the risk is ambiguous or stateful.`;
}
