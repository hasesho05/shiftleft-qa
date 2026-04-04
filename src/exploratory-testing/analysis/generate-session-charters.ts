import type { IntentContext } from "../models/intent-context";
import type {
  ExplorationFramework,
  ExplorationTheme,
} from "../models/risk-assessment";
import type {
  ObservationCategory,
  ObservationTarget,
  SessionCharter,
} from "../models/session-charter";
import {
  type CoverageAspect,
  type CoverageGapEntry,
  EXPLORATION_PRIORITY_ORDER,
} from "../models/test-mapping";

const WEB_COMPONENT_PATTERNS = [
  /\.tsx$/,
  /\.jsx$/,
  /\.vue$/,
  /\.svelte$/,
  /components?\//i,
  /pages?\//i,
  /views?\//i,
  /layouts?\//i,
];

const API_PATTERNS = [
  /routes?\//i,
  /api\//i,
  /controllers?\//i,
  /handlers?\//i,
  /middleware\//i,
  /endpoints?\//i,
];

const FRAMEWORK_GOAL_PREFIX: Record<ExplorationFramework, string> = {
  "equivalence-partitioning":
    "Identify input classes and verify each partition is handled correctly",
  "boundary-value-analysis": "Test boundary values at limits and edge cases",
  "state-transition":
    "Verify state changes follow the expected transition rules",
  "decision-table":
    "Validate decision logic for all relevant condition combinations",
  "cause-effect-graph":
    "Trace cause-effect relationships and confirm expected outcomes",
  pairwise: "Test combinations of parameters using pairwise techniques",
  sampling: "Sample representative scenarios and verify behavior",
  "error-guessing": "Probe for common error conditions and edge cases",
};

const FRAMEWORK_STOP_HINTS: Record<ExplorationFramework, string> = {
  "equivalence-partitioning":
    "All input partitions have been exercised at least once",
  "boundary-value-analysis":
    "Boundary values at both sides of each limit have been tested",
  "state-transition":
    "All reachable state transitions have been triggered and verified",
  "decision-table":
    "All condition combinations from the decision table have been tested",
  "cause-effect-graph": "All identified cause-effect paths have been exercised",
  pairwise: "All pairwise parameter combinations have been covered",
  sampling: "A sufficient sample of representative scenarios has been tested",
  "error-guessing": "All suspected error conditions have been attempted",
};

const FRAMEWORK_PRECONDITION_HINTS: Record<ExplorationFramework, string> = {
  "equivalence-partitioning": "Input domain boundaries are documented",
  "boundary-value-analysis": "Valid ranges and limits are known",
  "state-transition": "System is in a known initial state",
  "decision-table": "Decision rules and conditions are identified",
  "cause-effect-graph": "Cause-effect relationships are mapped",
  pairwise: "Parameter combinations are enumerable",
  sampling: "Representative data set is available",
  "error-guessing": "Common error patterns for this domain are identified",
};

const ASPECT_OBSERVATION_HINTS: Record<CoverageAspect, string> = {
  "happy-path":
    "Verify successful flow completes without unexpected side effects",
  "error-path":
    "Watch for unhandled errors, missing error messages, and silent failures",
  boundary: "Test values at exact boundaries, off-by-one, and type limits",
  permission: "Check that unauthorized access is properly denied and logged",
  "state-transition": "Observe state changes in UI, DB, or network responses",
  "mock-fixture":
    "Compare behavior against real integrations versus test fixtures",
};

export function generateSessionCharters(
  themes: readonly ExplorationTheme[],
  coverageGaps: readonly CoverageGapEntry[],
  intentContext?: IntentContext,
): readonly SessionCharter[] {
  if (themes.length === 0) {
    return [];
  }

  const gapsByFile = indexGapsByFile(coverageGaps);
  const enrichment = resolveCharterEnrichment(intentContext);

  const pairs = themes.map((theme) => ({
    charter: buildCharter(theme, gapsByFile, enrichment),
    riskLevel: theme.riskLevel,
  }));

  pairs.sort(
    (a, b) =>
      EXPLORATION_PRIORITY_ORDER[b.riskLevel] -
        EXPLORATION_PRIORITY_ORDER[a.riskLevel] ||
      b.charter.timeboxMinutes - a.charter.timeboxMinutes ||
      a.charter.title.localeCompare(b.charter.title),
  );

  return pairs.map((p) => p.charter);
}

function getPrimaryFramework(theme: ExplorationTheme): ExplorationFramework {
  const primary = theme.frameworks[0];
  if (!primary) {
    throw new Error(`ExplorationTheme "${theme.title}" has no frameworks`);
  }
  return primary;
}

function buildCharter(
  theme: ExplorationTheme,
  gapsByFile: ReadonlyMap<string, readonly CoverageGapEntry[]>,
  enrichment: CharterEnrichment | null,
): SessionCharter {
  const primaryFramework = getPrimaryFramework(theme);
  const relevantGaps = collectRelevantGaps(theme.targetFiles, gapsByFile);

  const basePreconditions = buildPreconditions(theme);
  const baseObservationTargets = buildObservationTargets(theme, relevantGaps);
  const baseGoal = buildGoal(primaryFramework, theme, relevantGaps);

  return {
    title: theme.title,
    goal: enrichment?.goalSuffix
      ? `${baseGoal}. ${enrichment.goalSuffix}`
      : baseGoal,
    scope: [...theme.targetFiles],
    selectedFrameworks: [...theme.frameworks],
    preconditions: [...basePreconditions, ...(enrichment?.preconditions ?? [])],
    observationTargets: [
      ...baseObservationTargets,
      ...(enrichment?.observationTargets ?? []),
    ],
    stopConditions: [...buildStopConditions(theme, primaryFramework)],
    timeboxMinutes: theme.estimatedMinutes,
  };
}

function buildGoal(
  primaryFramework: ExplorationFramework,
  theme: ExplorationTheme,
  relevantGaps: readonly CoverageGapEntry[],
): string {
  const prefix = FRAMEWORK_GOAL_PREFIX[primaryFramework];
  const parts = [prefix, theme.description];

  const uncoveredAspects = [
    ...new Set(
      relevantGaps.filter((g) => g.status !== "covered").map((g) => g.aspect),
    ),
  ];

  if (uncoveredAspects.length > 0) {
    parts.push(
      `Pay attention to uncovered aspects: ${uncoveredAspects.join(", ")}`,
    );
  }

  return parts.join(". ");
}

function buildPreconditions(theme: ExplorationTheme): readonly string[] {
  const preconditions: string[] = [];

  for (const framework of theme.frameworks) {
    preconditions.push(FRAMEWORK_PRECONDITION_HINTS[framework]);
  }

  if (hasWebComponents(theme.targetFiles)) {
    preconditions.push(
      "Application is running in a browser with DevTools open",
    );
  }

  if (hasApiFiles(theme.targetFiles)) {
    preconditions.push("API server is running and accessible");
  }

  return [...new Set(preconditions)];
}

function buildObservationTargets(
  theme: ExplorationTheme,
  relevantGaps: readonly CoverageGapEntry[],
): readonly ObservationTarget[] {
  const targets: ObservationTarget[] = [];
  const addedCategories = new Set<ObservationCategory>();

  const addTarget = (
    category: ObservationCategory,
    description: string,
  ): void => {
    if (!addedCategories.has(category)) {
      targets.push({ category, description });
      addedCategories.add(category);
    }
  };

  // Web component observations
  if (hasWebComponents(theme.targetFiles)) {
    addTarget("ui", "Verify visual rendering and user interaction feedback");
    addTarget("network", "Monitor HTTP requests, responses, and error codes");
    addTarget(
      "console",
      "Watch for errors, warnings, and unhandled rejections",
    );
  }

  // API observations
  if (hasApiFiles(theme.targetFiles)) {
    addTarget("network", "Verify API response codes, payloads, and headers");
    addTarget("console", "Watch for server-side errors and unexpected logs");
  }

  // Gap-driven observations
  for (const gap of relevantGaps) {
    if (gap.status === "covered") continue;

    const hint = ASPECT_OBSERVATION_HINTS[gap.aspect];
    if (gap.aspect === "permission") {
      addTarget("network", hint);
    } else if (gap.aspect === "state-transition") {
      addTarget("state", hint);
    } else if (gap.aspect === "error-path") {
      addTarget("console", hint);
    }
  }

  // Framework-driven observations
  if (theme.frameworks.includes("state-transition")) {
    addTarget("state", "Track state changes through the transition sequence");
  }

  // Fallback: ensure at least one target
  if (targets.length === 0) {
    addTarget("console", "Monitor for unexpected errors and warnings");
  }

  return targets;
}

function buildStopConditions(
  theme: ExplorationTheme,
  primaryFramework: ExplorationFramework,
): readonly string[] {
  const conditions: string[] = [];

  conditions.push(FRAMEWORK_STOP_HINTS[primaryFramework]);
  conditions.push("A blocking defect is discovered");
  conditions.push(`Timebox of ${theme.estimatedMinutes} minutes has elapsed`);

  return conditions;
}

function collectRelevantGaps(
  targetFiles: readonly string[],
  gapsByFile: ReadonlyMap<string, readonly CoverageGapEntry[]>,
): readonly CoverageGapEntry[] {
  const gaps: CoverageGapEntry[] = [];
  for (const file of targetFiles) {
    const fileGaps = gapsByFile.get(file);
    if (fileGaps) {
      gaps.push(...fileGaps);
    }
  }
  return gaps;
}

function indexGapsByFile(
  gaps: readonly CoverageGapEntry[],
): ReadonlyMap<string, readonly CoverageGapEntry[]> {
  const map = new Map<string, CoverageGapEntry[]>();
  for (const gap of gaps) {
    const entries = map.get(gap.changedFilePath) ?? [];
    entries.push(gap);
    map.set(gap.changedFilePath, entries);
  }
  return map;
}

function hasWebComponents(files: readonly string[]): boolean {
  return files.some((file) =>
    WEB_COMPONENT_PATTERNS.some((pattern) => pattern.test(file)),
  );
}

function hasApiFiles(files: readonly string[]): boolean {
  return files.some((file) =>
    API_PATTERNS.some((pattern) => pattern.test(file)),
  );
}

// ---------------------------------------------------------------------------
// Intent context enrichment for charters
// ---------------------------------------------------------------------------

type CharterEnrichment = {
  readonly goalSuffix: string | null;
  readonly preconditions: readonly string[];
  readonly observationTargets: readonly ObservationTarget[];
};

function resolveCharterEnrichment(
  intentContext?: IntentContext,
): CharterEnrichment | null {
  if (!intentContext || intentContext.extractionStatus === "empty") {
    return null;
  }

  const goalSuffix = intentContext.userStory
    ? `PR context: ${intentContext.userStory}`
    : null;

  const preconditions: string[] = [];
  for (const note of intentContext.notesForQa) {
    preconditions.push(`QA note: ${note}`);
  }

  const observationTargets: ObservationTarget[] = [];
  for (const criterion of intentContext.acceptanceCriteria) {
    observationTargets.push({
      category: "acceptance-criteria",
      description: `Verify: ${criterion}`,
    });
  }

  return { goalSuffix, preconditions, observationTargets };
}
