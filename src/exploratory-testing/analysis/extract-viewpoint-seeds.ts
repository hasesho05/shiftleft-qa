import type {
  ChangeCategory,
  FileChangeAnalysis,
  ViewpointSeed,
} from "../models/change-analysis";
import type { IntentContext } from "../models/intent-context";

type ViewpointName = ViewpointSeed["viewpoint"];

const CATEGORY_VIEWPOINT_MAP: Record<ChangeCategory, readonly ViewpointName[]> =
  {
    ui: ["ui-look-and-feel", "functional-user-flow"],
    api: ["functional-user-flow", "data-and-error-handling"],
    validation: ["data-and-error-handling"],
    "state-transition": ["functional-user-flow", "data-and-error-handling"],
    permission: ["user-persona", "architecture-cross-cutting"],
    async: ["architecture-cross-cutting", "data-and-error-handling"],
    schema: ["architecture-cross-cutting", "data-and-error-handling"],
    "shared-component": ["architecture-cross-cutting"],
    "feature-flag": ["functional-user-flow", "user-persona"],
    "cross-service": ["architecture-cross-cutting"],
  };

const CATEGORY_SEED_TEMPLATE: Record<ChangeCategory, (path: string) => string> =
  {
    ui: (p) =>
      `UI component changed: ${p} — verify visual rendering and interaction`,
    api: (p) => `API endpoint changed: ${p} — verify request/response flow`,
    validation: (p) =>
      `Validation logic changed: ${p} — verify input boundary handling`,
    "state-transition": (p) =>
      `State management changed: ${p} — verify state transitions`,
    permission: (p) =>
      `Permission/auth changed: ${p} — verify role-based access`,
    async: (p) =>
      `Async processing changed: ${p} — verify job execution and error handling`,
    schema: (p) =>
      `DB schema changed: ${p} — verify data migration and integrity`,
    "shared-component": (p) =>
      `Shared module changed: ${p} — verify all consumers`,
    "feature-flag": (p) =>
      `Feature flag changed: ${p} — verify toggle behavior for all states`,
    "cross-service": (p) =>
      `Cross-service contract changed: ${p} — verify integration points`,
  };

const ALL_VIEWPOINTS: readonly ViewpointName[] = [
  "functional-user-flow",
  "user-persona",
  "ui-look-and-feel",
  "data-and-error-handling",
  "architecture-cross-cutting",
];

function createEmptySeedMap(): Map<ViewpointName, string[]> {
  const map = new Map<ViewpointName, string[]>();
  for (const viewpoint of ALL_VIEWPOINTS) {
    map.set(viewpoint, []);
  }
  return map;
}

function toViewpointSeeds(
  seedsByViewpoint: ReadonlyMap<ViewpointName, readonly string[]>,
): readonly ViewpointSeed[] {
  return ALL_VIEWPOINTS.map((viewpoint) => ({
    viewpoint,
    seeds: [...(seedsByViewpoint.get(viewpoint) ?? [])],
  }));
}

export function extractViewpointSeeds(
  fileAnalyses: readonly FileChangeAnalysis[],
): readonly ViewpointSeed[] {
  const seedsByViewpoint = createEmptySeedMap();

  for (const analysis of fileAnalyses) {
    for (const categorized of analysis.categories) {
      const viewpoints = CATEGORY_VIEWPOINT_MAP[categorized.category];
      const seedText = CATEGORY_SEED_TEMPLATE[categorized.category](
        analysis.path,
      );

      for (const viewpoint of viewpoints) {
        seedsByViewpoint.get(viewpoint)?.push(seedText);
      }
    }
  }

  return toViewpointSeeds(seedsByViewpoint);
}

// ---------------------------------------------------------------------------
// Intent-derived viewpoint seeds
// ---------------------------------------------------------------------------

type ViewpointSeedEntry = {
  readonly viewpoint: ViewpointName;
  readonly seed: string;
};

const PURPOSE_SEED_MAP: Partial<
  Record<NonNullable<IntentContext["changePurpose"]>, ViewpointSeedEntry>
> = {
  feature: {
    viewpoint: "functional-user-flow",
    seed: "New feature — verify end-to-end user flow works as intended",
  },
  bugfix: {
    viewpoint: "data-and-error-handling",
    seed: "Bugfix — verify the fix resolves the issue and check for regression in related error paths",
  },
  refactor: {
    viewpoint: "architecture-cross-cutting",
    seed: "Refactor — verify existing behavior is preserved after structural changes",
  },
};

export function extractIntentViewpointSeeds(
  intentContext: IntentContext,
): readonly ViewpointSeed[] {
  if (intentContext.extractionStatus === "empty") {
    return [];
  }

  const seedsByViewpoint = createEmptySeedMap();

  addChangePurposeSeeds(intentContext, seedsByViewpoint);
  addUserStorySeeds(intentContext, seedsByViewpoint);
  addTargetUsersSeeds(intentContext, seedsByViewpoint);
  addAcceptanceCriteriaSeeds(intentContext, seedsByViewpoint);
  addNonGoalsSeeds(intentContext, seedsByViewpoint);
  addNotesForQaSeeds(intentContext, seedsByViewpoint);

  return toViewpointSeeds(seedsByViewpoint);
}

function addChangePurposeSeeds(
  ctx: IntentContext,
  map: Map<ViewpointName, string[]>,
): void {
  if (!ctx.changePurpose) return;

  const entry = PURPOSE_SEED_MAP[ctx.changePurpose];
  if (entry) {
    map.get(entry.viewpoint)?.push(entry.seed);
  }
}

function addUserStorySeeds(
  ctx: IntentContext,
  map: Map<ViewpointName, string[]>,
): void {
  if (!ctx.userStory) return;

  map.get("user-persona")?.push(`User story context: ${ctx.userStory}`);
  map.get("functional-user-flow")?.push(`User story flow: ${ctx.userStory}`);
}

function addTargetUsersSeeds(
  ctx: IntentContext,
  map: Map<ViewpointName, string[]>,
): void {
  if (ctx.targetUsers.length === 0) return;

  const users = ctx.targetUsers.join(", ");
  map
    .get("user-persona")
    ?.push(
      `Target users: ${users} — verify behavior from each user perspective`,
    );
}

function addAcceptanceCriteriaSeeds(
  ctx: IntentContext,
  map: Map<ViewpointName, string[]>,
): void {
  if (ctx.acceptanceCriteria.length === 0) return;

  const criteria = ctx.acceptanceCriteria.join("; ");
  map
    .get("functional-user-flow")
    ?.push(`Acceptance criteria to verify: ${criteria}`);
  map
    .get("data-and-error-handling")
    ?.push(`Acceptance criteria edge cases: ${criteria}`);
}

function addNonGoalsSeeds(
  ctx: IntentContext,
  map: Map<ViewpointName, string[]>,
): void {
  if (ctx.nonGoals.length === 0) return;

  const goals = ctx.nonGoals.join("; ");
  map
    .get("architecture-cross-cutting")
    ?.push(
      `Non-goal scope constraints: ${goals} — skip exploration of these areas`,
    );
}

function addNotesForQaSeeds(
  ctx: IntentContext,
  map: Map<ViewpointName, string[]>,
): void {
  if (ctx.notesForQa.length === 0) return;

  const notes = ctx.notesForQa.join("; ");
  map.get("data-and-error-handling")?.push(`QA notes: ${notes}`);
}
