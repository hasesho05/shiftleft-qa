import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type PersistedAllocationItem,
  type PersistedChangeAnalysis,
  type PersistedFinding,
  type PersistedPrIntake,
  type PersistedRiskAssessment,
  type PersistedSession,
  type PersistedSessionCharters,
  type PersistedTestMapping,
  findChangeAnalysis,
  findIntentContext,
  findPrIntakeById,
  findRiskAssessment,
  findSessionCharters,
  findTestMapping,
  listAllocationItems,
  listFindings,
  listSessionsByChartersId,
} from "../db/workspace-repository";
import { escapePipe } from "../lib/markdown";
import { renderIntentContextLines } from "../lib/render-intent-context";
import {
  type ConfidenceBucket,
  toConfidenceBucket,
} from "../models/allocation";
import type { ResolvedPluginConfig } from "../models/config";
import type { IntentContext } from "../models/intent-context";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportArtifactsInput = {
  readonly prIntakeId: number;
  readonly config: ResolvedPluginConfig;
};

export type ExportArtifactsResult = {
  readonly artifacts: {
    readonly explorationBrief: string;
    readonly coverageGapMap: string;
    readonly sessionCharters: string;
    readonly findingsReport: string;
    readonly automationCandidateReport: string;
    readonly heuristicFeedbackReport: string;
  };
  readonly handover: StepHandoverWriteResult;
};

// ---------------------------------------------------------------------------
// Collected data used by all artifact generators
// ---------------------------------------------------------------------------

type CollectedData = {
  readonly prIntake: PersistedPrIntake;
  readonly changeAnalysis: PersistedChangeAnalysis;
  readonly testMapping: PersistedTestMapping;
  readonly riskAssessment: PersistedRiskAssessment;
  readonly allocationItems: readonly PersistedAllocationItem[];
  readonly sessionCharters: PersistedSessionCharters;
  readonly sessions: readonly PersistedSession[];
  readonly findings: readonly PersistedFinding[];
  readonly intentContext: IntentContext | null;
};

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function exportArtifacts(
  input: ExportArtifactsInput,
): Promise<ExportArtifactsResult> {
  const { prIntakeId, config } = input;
  const databasePath = config.paths.database;

  const prIntake = findPrIntakeById(databasePath, prIntakeId);
  if (!prIntake) {
    throw new Error(`PR intake not found: id=${prIntakeId}`);
  }

  const data = collectData(databasePath, prIntake);
  const artifactsDir = config.paths.artifactsDirectory;
  await mkdir(artifactsDir, { recursive: true });

  const explorationBriefPath = resolve(artifactsDir, "exploration-brief.md");
  const coverageGapMapPath = resolve(artifactsDir, "coverage-gap-map.md");
  const sessionChartersPath = resolve(artifactsDir, "session-charters.md");
  const findingsReportPath = resolve(artifactsDir, "findings-report.md");
  const automationCandidateReportPath = resolve(
    artifactsDir,
    "automation-candidate-report.md",
  );
  const heuristicFeedbackReportPath = resolve(
    artifactsDir,
    "heuristic-feedback-report.md",
  );

  await Promise.all([
    writeFile(explorationBriefPath, buildExplorationBrief(data), "utf8"),
    writeFile(coverageGapMapPath, buildCoverageGapMap(data), "utf8"),
    writeFile(sessionChartersPath, buildSessionChartersDoc(data), "utf8"),
    writeFile(findingsReportPath, buildFindingsReport(data), "utf8"),
    writeFile(
      automationCandidateReportPath,
      buildAutomationCandidateReport(data),
      "utf8",
    ),
    writeFile(
      heuristicFeedbackReportPath,
      buildHeuristicFeedbackReport(data),
      "utf8",
    ),
  ]);

  const artifactPaths = {
    explorationBrief: explorationBriefPath,
    coverageGapMap: coverageGapMapPath,
    sessionCharters: sessionChartersPath,
    findingsReport: findingsReportPath,
    automationCandidateReport: automationCandidateReportPath,
    heuristicFeedbackReport: heuristicFeedbackReportPath,
  };

  const summary = buildHandoverSummary(data);
  const body = buildHandoverBody(data, artifactPaths);

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "export-artifacts",
    status: "completed",
    summary,
    body,
  });

  return { artifacts: artifactPaths, handover };
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

function collectData(
  databasePath: string,
  prIntake: PersistedPrIntake,
): CollectedData {
  const changeAnalysis = findChangeAnalysis(databasePath, prIntake.id);
  if (!changeAnalysis) {
    throw new Error(
      `Change analysis not found for pr_intake_id=${prIntake.id}. Run discover-context first.`,
    );
  }

  const testMapping = findTestMapping(databasePath, changeAnalysis.id);
  if (!testMapping) {
    throw new Error(
      `Test mapping not found for change_analysis_id=${changeAnalysis.id}. Run map-tests first.`,
    );
  }

  const riskAssessment = findRiskAssessment(databasePath, testMapping.id);
  if (!riskAssessment) {
    throw new Error(
      `Risk assessment not found for test_mapping_id=${testMapping.id}. Run assess-gaps first.`,
    );
  }

  const sessionCharters = findSessionCharters(databasePath, riskAssessment.id);
  if (!sessionCharters) {
    throw new Error(
      `Session charters not found for risk_assessment_id=${riskAssessment.id}. Run generate-charters first.`,
    );
  }

  const allocationItems = listAllocationItems(databasePath, riskAssessment.id);

  const sessions = listSessionsByChartersId(databasePath, sessionCharters.id);
  const findings: PersistedFinding[] = [];
  for (const session of sessions) {
    const sessionFindings = listFindings(databasePath, session.id);
    findings.push(...sessionFindings);
  }

  const intentContext = findIntentContext(databasePath, prIntake.id);

  return {
    prIntake,
    changeAnalysis,
    testMapping,
    riskAssessment,
    allocationItems,
    sessionCharters,
    sessions,
    findings,
    intentContext,
  };
}

// ---------------------------------------------------------------------------
// Exploration Brief
// ---------------------------------------------------------------------------

function buildExplorationBrief(data: CollectedData): string {
  const { prIntake, changeAnalysis, riskAssessment, intentContext } = data;
  const lines: string[] = [];

  lines.push("# Exploration Brief", "");
  lines.push(`**PR**: #${prIntake.prNumber} — ${escapePipe(prIntake.title)}`);
  lines.push(`**Author**: ${prIntake.author}`);
  lines.push(`**Branch**: ${prIntake.headBranch} → ${prIntake.baseBranch}`);
  lines.push(`**Head SHA**: ${prIntake.headSha}`);
  lines.push("");

  if (prIntake.description) {
    lines.push("## Description", "", prIntake.description, "");
  }

  lines.push(...buildIntentContextBriefSection(intentContext));

  lines.push("## Changed Files", "");
  lines.push("| Path | Status | +/- |");
  lines.push("| --- | --- | --- |");
  for (const file of prIntake.changedFiles) {
    lines.push(
      `| ${escapePipe(file.path)} | ${file.status} | +${file.additions} / -${file.deletions} |`,
    );
  }
  lines.push("");

  if (changeAnalysis.fileAnalyses.length > 0) {
    lines.push("## Change Categories", "");
    lines.push("| File | Categories |");
    lines.push("| --- | --- |");
    for (const fa of changeAnalysis.fileAnalyses) {
      const cats = fa.categories.map((c) => c.category).join(", ");
      lines.push(`| ${escapePipe(fa.path)} | ${cats || "-"} |`);
    }
    lines.push("");
  }

  if (changeAnalysis.viewpointSeeds.length > 0) {
    const nonEmpty = changeAnalysis.viewpointSeeds.filter(
      (v) => v.seeds.length > 0,
    );
    if (nonEmpty.length > 0) {
      lines.push("## Viewpoint Seeds", "");
      for (const vp of nonEmpty) {
        lines.push(`### ${vp.viewpoint}`, "");
        for (const seed of vp.seeds) {
          lines.push(`- ${escapePipe(seed)}`);
        }
        lines.push("");
      }
    }
  }

  lines.push("## Summary", "", changeAnalysis.summary, "");

  if (riskAssessment && riskAssessment.riskScores.length > 0) {
    lines.push("## High-Risk Areas", "");
    lines.push("| File | Risk Score | Top Factors |");
    lines.push("| --- | --- | --- |");
    const sorted = [...riskAssessment.riskScores].sort(
      (a, b) => b.overallRisk - a.overallRisk,
    );
    for (const rs of sorted) {
      const topFactors = rs.factors
        .slice(0, 2)
        .map((f) => f.factor)
        .join(", ");
      lines.push(
        `| ${escapePipe(rs.changedFilePath)} | ${rs.overallRisk.toFixed(2)} | ${escapePipe(topFactors || "-")} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildIntentContextBriefSection(
  intentContext: IntentContext | null,
): readonly string[] {
  return renderIntentContextLines("## Intent Context", intentContext);
}

// ---------------------------------------------------------------------------
// Coverage Gap Map
// ---------------------------------------------------------------------------

function buildCoverageGapMap(data: CollectedData): string {
  const { testMapping } = data;
  const lines: string[] = [];

  lines.push("# Coverage Gap Map", "");

  if (testMapping.coverageGapMap.length > 0) {
    lines.push("## Gap Entries", "");
    lines.push("| File | Aspect | Status | Priority |");
    lines.push("| --- | --- | --- | --- |");
    for (const entry of testMapping.coverageGapMap) {
      lines.push(
        `| ${escapePipe(entry.changedFilePath)} | ${entry.aspect} | ${entry.status} | ${entry.explorationPriority} |`,
      );
    }
    lines.push("");
  }

  if (testMapping.missingLayers.length > 0) {
    lines.push("## Missing Test Layers", "");
    for (const layer of testMapping.missingLayers) {
      lines.push(`- ${layer}`);
    }
    lines.push("");
  }

  if (testMapping.testAssets.length > 0) {
    lines.push("## Test Assets", "");
    lines.push("| Path | Layer |");
    lines.push("| --- | --- |");
    for (const asset of testMapping.testAssets) {
      lines.push(`| ${escapePipe(asset.path)} | ${asset.layer} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Session Charters
// ---------------------------------------------------------------------------

function buildSessionChartersDoc(data: CollectedData): string {
  const { sessionCharters, sessions } = data;
  const lines: string[] = [];

  lines.push("# Session Charters", "");

  if (sessionCharters.charters.length === 0) {
    lines.push("No session charters generated.", "");
    return lines.join("\n");
  }

  const sessionByIndex = new Map(sessions.map((s) => [s.charterIndex, s]));

  for (let i = 0; i < sessionCharters.charters.length; i++) {
    const charter = sessionCharters.charters[i];
    const session = sessionByIndex.get(i);

    lines.push(`## Charter ${i + 1}: ${escapePipe(charter.title)}`, "");
    lines.push(`**Goal**: ${escapePipe(charter.goal)}`);
    lines.push(`**Timebox**: ${charter.timeboxMinutes} minutes`);
    lines.push(
      `**Frameworks**: ${charter.selectedFrameworks.join(", ") || "-"}`,
    );

    if (session) {
      lines.push(`**Session status**: ${session.status}`);
    }

    lines.push("");

    if (charter.scope.length > 0) {
      lines.push("**Scope**:", "");
      for (const s of charter.scope) {
        lines.push(`- ${escapePipe(s)}`);
      }
      lines.push("");
    }

    if (charter.preconditions.length > 0) {
      lines.push("**Preconditions**:", "");
      for (const p of charter.preconditions) {
        lines.push(`- ${escapePipe(p)}`);
      }
      lines.push("");
    }

    if (charter.observationTargets.length > 0) {
      lines.push("**Observation targets**:", "");
      for (const t of charter.observationTargets) {
        lines.push(`- [${t.category}] ${escapePipe(t.description)}`);
      }
      lines.push("");
    }

    if (charter.stopConditions.length > 0) {
      lines.push("**Stop conditions**:", "");
      for (const c of charter.stopConditions) {
        lines.push(`- ${escapePipe(c)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Findings Report
// ---------------------------------------------------------------------------

function buildFindingsReport(data: CollectedData): string {
  const { findings, sessions } = data;
  const lines: string[] = [];

  lines.push("# Findings Report", "");

  if (findings.length === 0) {
    lines.push("No findings recorded.", "");
    return lines.join("\n");
  }

  const defects = findings.filter((f) => f.type === "defect");
  const specGaps = findings.filter((f) => f.type === "spec-gap");
  const autoCandidates = findings.filter(
    (f) => f.type === "automation-candidate",
  );

  lines.push("## Summary", "");
  lines.push(`- **Total**: ${findings.length}`);
  lines.push(`- **Defects**: ${defects.length}`);
  lines.push(`- **Spec gaps**: ${specGaps.length}`);
  lines.push(`- **Automation candidates**: ${autoCandidates.length}`);
  lines.push("");

  lines.push("## All Findings", "");
  lines.push("| # | Type | Title | Severity | Session |");
  lines.push("| --- | --- | --- | --- | --- |");

  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  for (const f of findings) {
    const session = sessionById.get(f.sessionId);
    const sessionLabel = session ? escapePipe(session.charterTitle) : "-";
    lines.push(
      `| ${f.id} | ${f.type} | ${escapePipe(f.title)} | ${f.severity} | ${sessionLabel} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Automation Candidate Report
// ---------------------------------------------------------------------------

function buildAutomationCandidateReport(data: CollectedData): string {
  const { findings } = data;
  const lines: string[] = [];

  lines.push("# Automation Candidate Report", "");

  const candidates = findings.filter((f) => f.type === "automation-candidate");

  if (candidates.length === 0) {
    lines.push("No automation candidates identified.", "");
    return lines.join("\n");
  }

  lines.push(`**Total candidates**: ${candidates.length}`, "");

  lines.push("## Candidates by Test Layer", "");

  const byLayer = new Map<string, PersistedFinding[]>();
  for (const c of candidates) {
    const layer = c.recommendedTestLayer ?? "unspecified";
    const existing = byLayer.get(layer) ?? [];
    existing.push(c);
    byLayer.set(layer, existing);
  }

  for (const [layer, layerCandidates] of byLayer) {
    lines.push(`### ${layer} (${layerCandidates.length})`, "");
    lines.push("| # | Title | Severity | Rationale |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of layerCandidates) {
      const rationale = c.automationRationale
        ? escapePipe(c.automationRationale)
        : "-";
      lines.push(
        `| ${c.id} | ${escapePipe(c.title)} | ${c.severity} | ${rationale} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Heuristic Feedback Report
// ---------------------------------------------------------------------------

function buildHeuristicFeedbackReport(data: CollectedData): string {
  const { findings, allocationItems, sessions, sessionCharters } = data;
  const lines: string[] = [];

  lines.push("# Heuristic Feedback Report", "");
  lines.push(`**Total findings**: ${findings.length}`);
  lines.push(`**Total allocation items**: ${allocationItems.length}`);
  lines.push(`**Total charters**: ${sessionCharters.charters.length}`);
  lines.push("");

  if (allocationItems.length === 0 && findings.length === 0) {
    lines.push("No allocation items or findings to correlate.", "");
    return lines.join("\n");
  }

  // Build session-to-charter lookup
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  // Build charter-scope-to-allocation lookup: for each file path, which allocation items reference it
  const allocationsByFile = new Map<string, PersistedAllocationItem[]>();
  for (const item of allocationItems) {
    for (const filePath of item.changedFilePaths) {
      const existing = allocationsByFile.get(filePath) ?? [];
      existing.push(item);
      allocationsByFile.set(filePath, existing);
    }
  }

  // Resolve each finding to its matched allocation items via session → charter → scope → allocation
  const findingAllocations = resolveFindingAllocations(
    findings,
    sessionById,
    sessionCharters,
    allocationsByFile,
  );

  lines.push(
    ...buildFindingsByDestination(findingAllocations, allocationItems),
  );
  lines.push(
    ...buildFindingsByConfidenceBucket(findingAllocations, allocationItems),
  );
  lines.push(...buildFindingsByGapAspect(findingAllocations));
  lines.push(...buildFindingsByCharter(findings, sessionById, sessionCharters));

  return lines.join("\n");
}

type FindingAllocationPair = {
  readonly finding: PersistedFinding;
  readonly matchedItems: readonly PersistedAllocationItem[];
};

function resolveFindingAllocations(
  findings: readonly PersistedFinding[],
  sessionById: ReadonlyMap<number, PersistedSession>,
  sessionCharters: PersistedSessionCharters,
  allocationsByFile: ReadonlyMap<string, PersistedAllocationItem[]>,
): readonly FindingAllocationPair[] {
  return findings.map((finding) => {
    const session = sessionById.get(finding.sessionId);
    if (!session) {
      return { finding, matchedItems: [] };
    }

    const charter = sessionCharters.charters[session.charterIndex];
    if (!charter) {
      return { finding, matchedItems: [] };
    }

    // Collect allocation items whose changedFilePaths overlap with charter scope
    const matchedItemIds = new Set<number>();
    const matchedItems: PersistedAllocationItem[] = [];
    for (const scopePath of charter.scope) {
      const items = allocationsByFile.get(scopePath) ?? [];
      for (const item of items) {
        if (!matchedItemIds.has(item.id)) {
          matchedItemIds.add(item.id);
          matchedItems.push(item);
        }
      }
    }

    return { finding, matchedItems };
  });
}

function countByKey<T, K extends string>(
  items: readonly T[],
  keyFn: (item: T) => K,
): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function countFindingsByKey<K extends string>(
  pairs: readonly FindingAllocationPair[],
  keyFn: (item: PersistedAllocationItem) => K,
): Map<K, number> {
  const counts = new Map<K, number>();
  for (const { matchedItems } of pairs) {
    const keys = new Set(matchedItems.map(keyFn));
    for (const key of keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function buildItemFindingsTable(
  heading: string,
  columnLabel: string,
  keys: readonly string[],
  itemCounts: ReadonlyMap<string, number>,
  findingCounts: ReadonlyMap<string, number>,
): readonly string[] {
  const lines: string[] = [];
  lines.push(`## ${heading}`, "");
  lines.push(`| ${columnLabel} | Allocated Items | Findings |`);
  lines.push("| --- | --- | --- |");
  for (const key of keys) {
    lines.push(
      `| ${escapePipe(key)} | ${itemCounts.get(key) ?? 0} | ${findingCounts.get(key) ?? 0} |`,
    );
  }
  lines.push("");
  return lines;
}

function buildFindingsByDestination(
  pairs: readonly FindingAllocationPair[],
  allItems: readonly PersistedAllocationItem[],
): readonly string[] {
  const keyFn = (i: PersistedAllocationItem): string =>
    i.recommendedDestination;
  const itemCounts = countByKey(allItems, keyFn);
  const findingCounts = countFindingsByKey(pairs, keyFn);
  const allKeys = [
    ...new Set([...itemCounts.keys(), ...findingCounts.keys()]),
  ].sort();
  return buildItemFindingsTable(
    "Findings by Allocation Destination",
    "Destination",
    allKeys,
    itemCounts,
    findingCounts,
  );
}

function buildFindingsByConfidenceBucket(
  pairs: readonly FindingAllocationPair[],
  allItems: readonly PersistedAllocationItem[],
): readonly string[] {
  const keyFn = (i: PersistedAllocationItem): ConfidenceBucket =>
    toConfidenceBucket(i.confidence);
  const itemCounts = countByKey(allItems, keyFn);
  const findingCounts = countFindingsByKey(pairs, keyFn);
  const buckets: readonly ConfidenceBucket[] = ["high", "medium", "low"];
  return buildItemFindingsTable(
    "Findings by Confidence Bucket",
    "Confidence",
    buckets,
    itemCounts,
    findingCounts,
  );
}

function buildFindingsByGapAspect(
  pairs: readonly FindingAllocationPair[],
): readonly string[] {
  const lines: string[] = [];
  lines.push("## Findings by Gap Aspect", "");

  // Count findings per gap aspect (from matched allocation items' sourceSignals)
  const findingCountByAspect = new Map<string, number>();
  for (const { matchedItems } of pairs) {
    const aspects = new Set(
      matchedItems.flatMap((i) => i.sourceSignals.gapAspects),
    );
    for (const aspect of aspects) {
      const count = findingCountByAspect.get(aspect) ?? 0;
      findingCountByAspect.set(aspect, count + 1);
    }
  }

  if (findingCountByAspect.size === 0) {
    lines.push("No gap aspects linked to findings.", "");
    return lines;
  }

  lines.push("| Gap Aspect | Findings |");
  lines.push("| --- | --- |");
  const sorted = [...findingCountByAspect.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  for (const [aspect, count] of sorted) {
    lines.push(`| ${escapePipe(aspect)} | ${count} |`);
  }
  lines.push("");

  return lines;
}

function buildFindingsByCharter(
  findings: readonly PersistedFinding[],
  sessionById: ReadonlyMap<number, PersistedSession>,
  sessionCharters: PersistedSessionCharters,
): readonly string[] {
  const lines: string[] = [];
  lines.push("## Findings by Charter", "");

  if (sessionCharters.charters.length === 0) {
    lines.push("No charters generated.", "");
    return lines;
  }

  // Count findings per charter index
  const findingsByCharterIndex = new Map<number, number>();
  for (const finding of findings) {
    const session = sessionById.get(finding.sessionId);
    if (!session) continue;
    const count = findingsByCharterIndex.get(session.charterIndex) ?? 0;
    findingsByCharterIndex.set(session.charterIndex, count + 1);
  }

  lines.push("| Charter | Frameworks | Findings |");
  lines.push("| --- | --- | --- |");
  for (let i = 0; i < sessionCharters.charters.length; i++) {
    const charter = sessionCharters.charters[i];
    const frameworks = charter.selectedFrameworks.join(", ") || "-";
    const count = findingsByCharterIndex.get(i) ?? 0;
    lines.push(
      `| ${escapePipe(charter.title)} | ${escapePipe(frameworks)} | ${count} |`,
    );
  }
  lines.push("");

  return lines;
}

// ---------------------------------------------------------------------------
// Handover helpers
// ---------------------------------------------------------------------------

function buildHandoverSummary(data: CollectedData): string {
  const { findings, sessions, sessionCharters } = data;
  const defects = findings.filter((f) => f.type === "defect").length;
  const autoCandidates = findings.filter(
    (f) => f.type === "automation-candidate",
  ).length;
  const charterCount = sessionCharters.charters.length;
  const sessionCount = sessions.length;

  const parts = [
    `${charterCount} charter(s)`,
    `${sessionCount} session(s)`,
    `${findings.length} finding(s)`,
    `${defects} defect(s)`,
    `${autoCandidates} automation candidate(s)`,
    "6 artifact files exported",
  ];

  return parts.join("; ");
}

function buildHandoverBody(
  data: CollectedData,
  paths: ExportArtifactsResult["artifacts"],
): string {
  const lines = [
    "# Export Artifacts",
    "",
    `**PR**: #${data.prIntake.prNumber} — ${escapePipe(data.prIntake.title)}`,
    "",
    "## Exported Files",
    "",
    `- Exploration Brief: \`${paths.explorationBrief}\``,
    `- Coverage Gap Map: \`${paths.coverageGapMap}\``,
    `- Session Charters: \`${paths.sessionCharters}\``,
    `- Findings Report: \`${paths.findingsReport}\``,
    `- Automation Candidate Report: \`${paths.automationCandidateReport}\``,
    `- Heuristic Feedback Report: \`${paths.heuristicFeedbackReport}\``,
    "",
  ];

  return lines.join("\n");
}
