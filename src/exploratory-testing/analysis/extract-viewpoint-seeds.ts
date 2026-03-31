import type {
  ChangeCategory,
  FileChangeAnalysis,
  ViewpointSeed,
} from "../models/change-analysis";

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

export function extractViewpointSeeds(
  fileAnalyses: readonly FileChangeAnalysis[],
): readonly ViewpointSeed[] {
  const seedsByViewpoint = new Map<ViewpointName, string[]>();

  for (const viewpoint of ALL_VIEWPOINTS) {
    seedsByViewpoint.set(viewpoint, []);
  }

  for (const analysis of fileAnalyses) {
    for (const categorized of analysis.categories) {
      const viewpoints = CATEGORY_VIEWPOINT_MAP[categorized.category];
      const seedText = CATEGORY_SEED_TEMPLATE[categorized.category](
        analysis.path,
      );

      for (const viewpoint of viewpoints) {
        const existing = seedsByViewpoint.get(viewpoint);
        if (existing) {
          existing.push(seedText);
        }
      }
    }
  }

  return ALL_VIEWPOINTS.map((viewpoint) => ({
    viewpoint,
    seeds: seedsByViewpoint.get(viewpoint) ?? [],
  }));
}
