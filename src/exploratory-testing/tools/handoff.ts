import {
  type PersistedAllocationItem,
  type PersistedPrIntake,
  type PersistedSession,
  countAllocationItemsByDestination,
  findPrIntakeById,
  findRiskAssessmentById,
  findSession,
  findSessionChartersById,
  findTestMappingById,
  listAllocationItems,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import {
  type AllocationDestinationCounts,
  type ConfidenceBucket,
  toConfidenceBucket,
} from "../models/allocation";
import type { ResolvedPluginConfig } from "../models/config";
import type { CreatedComment, CreatedIssue } from "../models/github-issue";
import {
  type AddCommentInput,
  type CreateIssueInput,
  type EditIssueInput,
  addIssueComment,
  createIssue,
  editIssueBody,
} from "../scm/github-issues";
import { readPluginConfig } from "./config";
import { writeStepHandoverFromConfig } from "./progress";
import { generateTriageReport } from "./triage-findings";

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

export type HandoffFindingsInput = {
  readonly issueNumber: number;
  readonly sessionId: number;
  readonly configPath?: string;
  readonly manifestPath?: string;
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

export type AddHandoffCommentResult = {
  readonly comment: CreatedComment;
  readonly body: string;
};

export type AddHandoffCommentRawResult = {
  readonly comment: CreatedComment;
};

type HandoffContext = {
  readonly prIntake: PersistedPrIntake;
  readonly items: readonly PersistedAllocationItem[];
  readonly counts: AllocationDestinationCounts;
};

export async function generateHandoffMarkdown(
  input: HandoffGenerateInput,
): Promise<HandoffMarkdownResult> {
  const context = await resolveHandoffContext(input);
  const sections = groupBySection(context.items);
  const summary = buildHandoffSummary(context.counts);

  return {
    riskAssessmentId: input.riskAssessmentId,
    repository: context.prIntake.repository,
    markdown: renderHandoffMarkdown(context.prIntake, input.riskAssessmentId, {
      sections,
      summary,
    }),
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

  const issue = await createIssue({
    repositoryRoot: config.workspaceRoot,
    repository: markdown.repository,
    title:
      input.title ??
      `QA: PR #${extractPrNumber(markdown.markdown)} — handoff checklist`,
    body: markdown.markdown,
    labels: input.labels,
    assignees: input.assignees,
  });

  await writeStepHandoverFromConfig(config, {
    stepName: "handoff",
    status: "completed",
    summary: buildHandoffProgressSummary(markdown.summary, issue.number),
    body: buildHandoffProgressBody(markdown, issue.number, issue.url),
  });

  return { markdown, issue };
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
    repository: markdown.repository,
    issueNumber: input.issueNumber,
    body: markdown.markdown,
  });

  await writeStepHandoverFromConfig(config, {
    stepName: "handoff",
    status: "completed",
    summary: buildHandoffProgressSummary(markdown.summary, input.issueNumber),
    body: buildHandoffProgressBody(markdown, input.issueNumber),
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

export async function runAddHandoffComment(
  input: HandoffFindingsInput,
): Promise<AddHandoffCommentResult> {
  const config = await readPluginConfig(input.configPath, input.manifestPath);
  const context = resolveFindingsContext(config, input.sessionId);
  const report = await generateTriageReport({
    sessionId: input.sessionId,
    config,
  });
  const body = renderFindingsComment(context.session, report);

  const comment = await addIssueComment({
    repositoryRoot: config.workspaceRoot,
    repository: context.prIntake.repository,
    issueNumber: input.issueNumber,
    body,
  });

  return { comment, body };
}

export async function runAddHandoffCommentRaw(
  input: AddCommentInput,
): Promise<AddHandoffCommentRawResult> {
  const comment = await addIssueComment(input);
  return { comment };
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

export function renderHandoffMarkdown(
  prIntake: PersistedPrIntake,
  riskAssessmentId: number,
  input: {
    readonly sections: HandoffSections;
    readonly summary: HandoffSummary;
  },
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
    "### Notes",
    "",
    "> These are heuristic recommendations derived from code, diff, and test analysis — not confirmed decisions. Confidence levels reflect the strength of available signals. Use your judgement to override where appropriate.",
    "",
    `- Risk assessment ID: ${riskAssessmentId}`,
    "- Generated by exploratory-testing-plugin",
    "",
  ].join("\n");
}

export function renderFindingsComment(
  session: PersistedSession,
  report: Awaited<ReturnType<typeof generateTriageReport>>,
): string {
  const lines = [
    `## ${escapePipe(`Exploration Findings — Session: ${session.charterTitle}`)}`,
    "",
    `**Charter**: ${escapePipe(session.charterTitle)}`,
    `**Status**: ${session.status}`,
    `**Session ID**: ${session.id}`,
    "",
    "### Findings",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("_No findings from this session._", "");
    return lines.join("\n");
  }

  for (const finding of report.findings) {
    lines.push(
      `#### ${escapePipe(finding.title)}`,
      "",
      `- **Type**: ${finding.type}`,
      `- **Severity**: ${finding.severity}`,
      `- **Description**: ${escapePipe(finding.description)}`,
    );

    if (finding.type === "automation-candidate") {
      lines.push(
        `- **Recommended layer**: ${finding.recommendedTestLayer ?? "—"}`,
        `- **Rationale**: ${escapePipe(finding.automationRationale ?? "")}`,
      );
    }

    lines.push("");
  }

  return lines.join("\n");
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

function buildHandoffProgressSummary(
  summary: HandoffSummary,
  issueNumber: number,
): string {
  return `Published QA handoff issue #${issueNumber}; manual: ${summary.manualCount}; automate: ${summary.automateCount}; covered: ${summary.coveredCount}`;
}

function buildHandoffProgressBody(
  markdown: HandoffMarkdownResult,
  issueNumber: number,
  issueUrl?: string,
): string {
  const lines = [
    `# QA Handoff Published (risk_assessment_id: ${markdown.riskAssessmentId})`,
    "",
    `- **Issue Number**: ${issueNumber}`,
    `- **Repository**: ${escapePipe(markdown.repository)}`,
  ];

  if (issueUrl) {
    lines.push(`- **Issue URL**: ${issueUrl}`);
  }

  lines.push(
    "",
    "## Allocation Summary",
    "",
    `- Total items: ${markdown.summary.totalItems}`,
    `- Manual exploration: ${markdown.summary.manualCount}`,
    `- Should automate: ${markdown.summary.automateCount}`,
    `- Already covered: ${markdown.summary.coveredCount}`,
    "",
    "## Next step",
    "",
    "- generate-charters",
    "",
  );

  return lines.join("\n");
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

  return {
    prIntake,
    items,
    counts,
  };
}

function resolveFindingsContext(
  config: ResolvedPluginConfig,
  sessionId: number,
): {
  readonly session: PersistedSession;
  readonly prIntake: PersistedPrIntake;
} {
  const session = findSession(config.paths.database, sessionId);

  if (!session) {
    throw new Error(`Session not found: id=${sessionId}`);
  }

  const charters = findSessionChartersById(
    config.paths.database,
    session.sessionChartersId,
  );

  if (!charters) {
    throw new Error(
      `Session charters not found for id=${session.sessionChartersId}.`,
    );
  }

  const riskAssessment = findRiskAssessmentById(
    config.paths.database,
    charters.riskAssessmentId,
  );

  if (!riskAssessment) {
    throw new Error(
      `Risk assessment not found for id=${charters.riskAssessmentId}.`,
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

  const prIntake = findPrIntakeById(
    config.paths.database,
    testMapping.prIntakeId,
  );

  if (!prIntake) {
    throw new Error(`PR intake not found for id=${testMapping.prIntakeId}.`);
  }

  return { session, prIntake };
}

function extractPrNumber(markdown: string): number {
  const match = markdown.match(/PR #(\d+)/);

  if (!match) {
    return 0;
  }

  return Number(match[1]);
}
