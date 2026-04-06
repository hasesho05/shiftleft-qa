import {
  LAYER_APPLICABILITY_LAYERS,
  type LayerApplicabilityAssessment,
  assessLayerApplicability,
} from "../analysis/assess-layer-applicability";
import {
  type PersistedAllocationItem,
  type PersistedChangeAnalysis,
  type PersistedPrIntake,
  type PersistedTestMapping,
  countAllocationItemsByDestination,
  findChangeAnalysisById,
  findIntentContext,
  findPrIntakeById,
  findRiskAssessmentById,
  findTestMappingById,
  listAllocationItems,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import { renderIntentContextLines } from "../lib/render-intent-context";
import {
  type StabilityNote,
  collectStabilityNotesFromTestMapping,
  renderStabilityNotesMarkdown,
} from "../lib/render-stability-notes";
import {
  type AllocationDestinationCounts,
  type ConfidenceBucket,
  toConfidenceBucket,
} from "../models/allocation";
import type { ResolvedPluginConfig } from "../models/config";
import type { CreatedComment, CreatedIssue } from "../models/github-issue";
import type { IntentContext } from "../models/intent-context";
import {
  type AddCommentInput,
  type CreateIssueInput,
  type EditIssueInput,
  addIssueComment,
  createIssue,
  editIssueBody,
  findIssueBySearch,
} from "../scm/github-issues";
import { readPluginConfig } from "./config";

export type { AddCommentInput, CreateIssueInput, EditIssueInput };

export type HandoffGenerateInput = {
  readonly riskAssessmentId: number;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type HandoffPublishInput = HandoffGenerateInput & {
  readonly title?: string;
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
};

export type HandoffUpdateInput = HandoffGenerateInput & {
  readonly issueNumber: number;
};

export type PublishHandoffLifecycleInput = HandoffPublishInput & {
  readonly issueNumber?: number;
};

export type HandoffSections = {
  readonly alreadyCovered: readonly PersistedAllocationItem[];
  readonly shouldAutomate: readonly PersistedAllocationItem[];
  readonly manualExploration: readonly PersistedAllocationItem[];
};

export type HandoffSummary = {
  readonly totalItems: number;
  readonly manualCount: number;
  readonly automateCount: number;
  readonly coveredCount: number;
};

export type HandoffMarkdownResult = {
  readonly riskAssessmentId: number;
  readonly prNumber: number;
  readonly repository: string;
  readonly markdown: string;
  readonly sections: HandoffSections;
  readonly counts: AllocationDestinationCounts;
  readonly summary: HandoffSummary;
};

export type CreateHandoffIssueResult = {
  readonly markdown: HandoffMarkdownResult;
  readonly issue: CreatedIssue;
};

export type CreateHandoffIssueRawResult = {
  readonly issue: CreatedIssue;
};

export type UpdateHandoffIssueResult = {
  readonly markdown: HandoffMarkdownResult;
  readonly issueNumber: number;
};

export type AddHandoffCommentRawResult = {
  readonly comment: CreatedComment;
};

export type PublishHandoffLifecycleResult = {
  readonly action: "created" | "updated";
  readonly issueNumber: number;
  readonly issueUrl?: string;
  readonly title: string;
};

type HandoffContext = {
  readonly prIntake: PersistedPrIntake;
  readonly changeAnalysis: PersistedChangeAnalysis;
  readonly testMapping: PersistedTestMapping;
  readonly items: readonly PersistedAllocationItem[];
  readonly counts: AllocationDestinationCounts;
  readonly intentContext: IntentContext | null;
};

export async function generateHandoffMarkdown(
  input: HandoffGenerateInput,
): Promise<HandoffMarkdownResult> {
  const context = await resolveHandoffContext(input);
  const sections = groupBySection(context.items);
  const summary = buildHandoffSummary(context.counts);
  const applicability = assessLayerApplicability({
    changedFilePaths: context.prIntake.changedFiles.map((file) => file.path),
    fileAnalyses: context.changeAnalysis.fileAnalyses,
    allocationItems: context.items,
  });
  const stabilityNotes = collectStabilityNotesFromTestMapping(
    context.testMapping,
  );

  return {
    riskAssessmentId: input.riskAssessmentId,
    prNumber: context.prIntake.prNumber,
    repository: context.prIntake.repository,
    markdown: renderHandoffMarkdown(
      context.prIntake,
      input.riskAssessmentId,
      { sections, summary, applicability, stabilityNotes },
      context.intentContext ?? undefined,
    ),
    sections,
    counts: context.counts,
    summary,
  };
}

export async function runCreateHandoffIssue(
  input: HandoffPublishInput,
): Promise<CreateHandoffIssueResult> {
  const markdown = await generateHandoffMarkdown(input);
  const config = await readPluginConfig(input.configPath, input.manifestPath);
  const publishDefaults = resolvePublishDefaults(config, markdown, input);

  const issue = await createIssue({
    repositoryRoot: config.workspaceRoot,
    repository: publishDefaults.repository,
    title: publishDefaults.title,
    body: markdown.markdown,
    labels: publishDefaults.labels,
    assignees: publishDefaults.assignees,
  });

  return { markdown, issue };
}

type ResolvedPublishDefaults = {
  readonly repository: string;
  readonly title: string;
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
};

function resolvePublishDefaults(
  config: ResolvedPluginConfig,
  markdown: HandoffMarkdownResult,
  input: HandoffPublishInput,
): ResolvedPublishDefaults {
  const repository = resolvePublishRepository(config, markdown.repository);
  const titlePrefix = config.publishDefaults.titlePrefix ?? "QA";
  const title =
    input.title ??
    `${titlePrefix}: PR #${markdown.prNumber} — handoff checklist`;

  const labels =
    input.labels ?? normalizeOptionalStringArray(config.publishDefaults.labels);
  const assignees =
    input.assignees ??
    normalizeOptionalStringArray(config.publishDefaults.assignees);

  return {
    repository,
    title,
    labels,
    assignees,
  };
}

function resolvePublishRepository(
  config: ResolvedPluginConfig,
  fallbackRepository: string,
): string {
  return config.publishDefaults.repository ?? fallbackRepository;
}

function normalizeOptionalStringArray(
  values: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  return values;
}

async function createLifecycleIssue(
  _config: ResolvedPluginConfig,
  input: PublishHandoffLifecycleInput,
): Promise<PublishHandoffLifecycleResult> {
  const created = await runCreateHandoffIssue(input);

  return {
    action: "created",
    issueNumber: created.issue.number,
    issueUrl: created.issue.url,
    title: created.issue.title,
  };
}

async function updateLifecycleIssue(
  _config: ResolvedPluginConfig,
  input: PublishHandoffLifecycleInput,
  title: string,
  issueNumber: number,
  issueUrl?: string,
): Promise<PublishHandoffLifecycleResult> {
  await runUpdateHandoffIssue({
    riskAssessmentId: input.riskAssessmentId,
    issueNumber,
    configPath: input.configPath,
    manifestPath: input.manifestPath,
  });

  return {
    action: "updated",
    issueNumber,
    issueUrl,
    title,
  };
}

export async function runCreateHandoffIssueRaw(
  input: CreateIssueInput,
): Promise<CreateHandoffIssueRawResult> {
  const issue = await createIssue(input);
  return { issue };
}

export async function runUpdateHandoffIssue(
  input: HandoffUpdateInput,
): Promise<UpdateHandoffIssueResult> {
  const markdown = await generateHandoffMarkdown(input);
  const config = await readPluginConfig(input.configPath, input.manifestPath);

  await editIssueBody({
    repositoryRoot: config.workspaceRoot,
    repository: resolvePublishRepository(config, markdown.repository),
    issueNumber: input.issueNumber,
    body: markdown.markdown,
  });

  return {
    markdown,
    issueNumber: input.issueNumber,
  };
}

export async function runUpdateHandoffIssueBody(
  input: EditIssueInput,
): Promise<void> {
  await editIssueBody(input);
}

export async function runAddHandoffCommentRaw(
  input: AddCommentInput,
): Promise<AddHandoffCommentRawResult> {
  const comment = await addIssueComment(input);
  return { comment };
}

export async function runPublishHandoffLifecycle(
  input: PublishHandoffLifecycleInput,
): Promise<PublishHandoffLifecycleResult> {
  const markdown = await generateHandoffMarkdown(input);
  const config = await readPluginConfig(input.configPath, input.manifestPath);
  const publishDefaults = resolvePublishDefaults(config, markdown, input);
  const publishMode = config.publishDefaults.mode ?? "create-or-update";

  if (publishMode === "create") {
    return createLifecycleIssue(config, input);
  }

  if (publishMode === "update") {
    if (input.issueNumber === undefined) {
      throw new Error(
        "target issue number is required when publishDefaults.mode is 'update'.",
      );
    }

    return updateLifecycleIssue(
      config,
      input,
      publishDefaults.title,
      input.issueNumber,
    );
  }

  if (input.issueNumber !== undefined) {
    return updateLifecycleIssue(
      config,
      input,
      publishDefaults.title,
      input.issueNumber,
    );
  }

  const existingIssue = await findIssueBySearch({
    repositoryRoot: config.workspaceRoot,
    repository: publishDefaults.repository,
    searchQuery: `"${escapeSearchQueryValue(publishDefaults.title)}" in:title`,
  });

  if (existingIssue) {
    return updateLifecycleIssue(
      config,
      input,
      existingIssue.title,
      existingIssue.number,
      existingIssue.url,
    );
  }

  return createLifecycleIssue(config, input);
}

export function groupBySection(
  items: readonly PersistedAllocationItem[],
): HandoffSections {
  return {
    alreadyCovered: items.filter(
      (item) =>
        item.recommendedDestination === "skip" ||
        item.recommendedDestination === "review",
    ),
    shouldAutomate: items.filter((item) =>
      ["unit", "integration", "e2e", "visual"].includes(
        item.recommendedDestination,
      ),
    ),
    manualExploration: items.filter((item) =>
      ["manual-exploration", "dev-box"].includes(item.recommendedDestination),
    ),
  };
}

export type { StabilityNote };

export function renderHandoffMarkdown(
  prIntake: PersistedPrIntake,
  riskAssessmentId: number,
  input: {
    readonly sections: HandoffSections;
    readonly summary: HandoffSummary;
    readonly applicability?: LayerApplicabilityAssessment;
    readonly stabilityNotes?: readonly StabilityNote[];
  },
  intentContext?: IntentContext,
): string {
  const prUrl =
    prIntake.provider === "github"
      ? `https://github.com/${prIntake.repository}/pull/${prIntake.prNumber}`
      : `${prIntake.repository}#${prIntake.prNumber}`;

  return [
    `## ${escapePipe(`QA Handoff — PR #${prIntake.prNumber}: ${prIntake.title}`)}`,
    "",
    `**PR**: ${prUrl}`,
    `**Author**: ${escapePipe(prIntake.author)}`,
    `**Branch**: ${escapePipe(prIntake.headBranch)} -> ${escapePipe(prIntake.baseBranch)}`,
    `**Generated**: ${new Date().toISOString()}`,
    "",
    "### Summary",
    "",
    escapePipe(prIntake.title),
    "",
    `- Total items: ${input.summary.totalItems}`,
    `- Manual exploration: ${input.summary.manualCount}`,
    `- Should automate: ${input.summary.automateCount}`,
    `- Already covered: ${input.summary.coveredCount}`,
    "",
    ...renderIntentContextSection(intentContext),
    ...(input.applicability
      ? renderLayerApplicabilitySection(input.applicability)
      : []),
    "---",
    "",
    "### ✅ Already Covered",
    ...renderCoveredSection(input.sections.alreadyCovered),
    "",
    "---",
    "",
    "### 🔧 Should Automate",
    ...renderAutomationSection(input.sections.shouldAutomate),
    "",
    "---",
    "",
    "### 🔍 Manual Exploration Required",
    ...renderManualSection(input.sections.manualExploration),
    "",
    ...renderStabilityNotesSection(input.stabilityNotes ?? []),
    "### Notes",
    "",
    "> These are heuristic recommendations derived from code, diff, and test analysis — not confirmed decisions. Confidence levels reflect the strength of available signals. Use your judgement to override where appropriate.",
    "",
    `- Risk assessment ID: ${riskAssessmentId}`,
    "- Generated by shiftleft-qa",
    "",
  ].join("\n");
}

function renderIntentContextSection(
  intentContext?: IntentContext,
): readonly string[] {
  const base = renderIntentContextLines("### PR Intent Context", intentContext);
  if (base.length === 0) {
    return [];
  }
  return [...base, "---", ""];
}

export { collectStabilityNotesFromTestMapping };

function renderStabilityNotesSection(
  notes: readonly StabilityNote[],
): readonly string[] {
  if (notes.length === 0) {
    return [];
  }

  return [
    "---",
    "",
    "### ⚠ 既存テストの注意点",
    "",
    ...renderStabilityNotesMarkdown(notes),
    "",
  ];
}

const APPLICABILITY_LABELS = {
  primary: "primary",
  secondary: "secondary",
  "not-primary": "not-primary",
  "no-product-change": "no-product-change",
} as const;

const LAYER_LABELS = {
  unit: "unit",
  "integration-service": "integration/service",
  "ui-e2e": "ui/e2e",
  visual: "visual",
  "manual-exploration": "manual exploration",
} as const;

function renderLayerApplicabilitySection(
  applicability: LayerApplicabilityAssessment,
): readonly string[] {
  const lines = ["### Layer Applicability", ""];

  for (const layer of LAYER_APPLICABILITY_LAYERS) {
    const entry = applicability[layer];
    lines.push(
      `- **${LAYER_LABELS[layer]}**: \`${APPLICABILITY_LABELS[entry.status]}\` — ${escapePipe(entry.reason)}`,
    );
  }

  return [...lines, "", "---", ""];
}

const CONFIDENCE_ICONS: Record<ConfidenceBucket, string> = {
  high: "🟢",
  medium: "🟡",
  low: "🔴",
};

function renderConfidenceBadge(confidence: number): string {
  const bucket = toConfidenceBucket(confidence);
  return `${CONFIDENCE_ICONS[bucket]} ${bucket}`;
}

function renderCoveredSection(
  items: readonly PersistedAllocationItem[],
): readonly string[] {
  if (items.length === 0) {
    return ["", "_No items in this category._"];
  }

  return [
    "",
    ...items.map(
      (item) =>
        `- **${escapePipe(item.title)}** — ${escapePipe(item.rationale)} _(${item.recommendedDestination})_ \`${renderConfidenceBadge(item.confidence)}\``,
    ),
  ];
}

function renderAutomationSection(
  items: readonly PersistedAllocationItem[],
): readonly string[] {
  if (items.length === 0) {
    return ["", "_No automation recommendations._"];
  }

  return [
    "",
    ...items.map(
      (item) =>
        `- [ ] **${escapePipe(item.title)}** -> **${item.recommendedDestination}** — ${escapePipe(item.rationale)} \`${renderConfidenceBadge(item.confidence)}\``,
    ),
  ];
}

function renderManualSection(
  items: readonly PersistedAllocationItem[],
): readonly string[] {
  if (items.length === 0) {
    return ["", "_No manual exploration needed._"];
  }

  return [
    "",
    ...items.map((item) => {
      const prefix =
        item.recommendedDestination === "dev-box" ? "[dev-box] " : "";
      return `- [ ] **${escapePipe(prefix + item.title)}** _(${item.riskLevel})_ — ${escapePipe(item.rationale)} \`${renderConfidenceBadge(item.confidence)}\``;
    }),
  ];
}

function buildHandoffSummary(
  counts: AllocationDestinationCounts,
): HandoffSummary {
  return {
    totalItems: Object.values(counts).reduce((sum, count) => sum + count, 0),
    manualCount: counts["manual-exploration"] + counts["dev-box"],
    automateCount:
      counts.unit + counts.integration + counts.e2e + counts.visual,
    coveredCount: counts.skip + counts.review,
  };
}

async function resolveHandoffContext(
  input: HandoffGenerateInput,
): Promise<HandoffContext> {
  const config = await readPluginConfig(input.configPath, input.manifestPath);
  const riskAssessment = findRiskAssessmentById(
    config.paths.database,
    input.riskAssessmentId,
  );

  if (!riskAssessment) {
    throw new Error(
      `Risk assessment not found for id=${input.riskAssessmentId}. Run assess-gaps first.`,
    );
  }

  const testMapping = findTestMappingById(
    config.paths.database,
    riskAssessment.testMappingId,
  );

  if (!testMapping) {
    throw new Error(
      `Test mapping not found for id=${riskAssessment.testMappingId}.`,
    );
  }

  const changeAnalysis = findChangeAnalysisById(
    config.paths.database,
    testMapping.changeAnalysisId,
  );

  if (!changeAnalysis) {
    throw new Error(
      `Change analysis not found for id=${testMapping.changeAnalysisId}.`,
    );
  }

  const prIntake = findPrIntakeById(
    config.paths.database,
    testMapping.prIntakeId,
  );

  if (!prIntake) {
    throw new Error(`PR intake not found for id=${testMapping.prIntakeId}.`);
  }

  const items = listAllocationItems(
    config.paths.database,
    input.riskAssessmentId,
  );
  const counts = countAllocationItemsByDestination(
    config.paths.database,
    input.riskAssessmentId,
  );

  const intentContext = findIntentContext(config.paths.database, prIntake.id);

  return {
    prIntake,
    changeAnalysis,
    testMapping,
    items,
    counts,
    intentContext,
  };
}

function escapeSearchQueryValue(value: string): string {
  return value.replaceAll('"', '\\"');
}
