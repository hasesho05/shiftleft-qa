import { describe, expect, it } from "vitest";

import {
  buildHandoffViewModel,
  deriveDisplayTestLayers,
} from "../../src/exploratory-testing/analysis/build-requirement-view";
import type {
  PersistedAllocationItem,
  PersistedChangeAnalysis,
  PersistedPrIntake,
  PersistedTestMapping,
} from "../../src/exploratory-testing/db/workspace-repository";
import type { IntentContext } from "../../src/exploratory-testing/models/intent-context";

function makeIntentContext(
  overrides: Partial<IntentContext> = {},
): IntentContext {
  return {
    changePurpose: overrides.changePurpose ?? null,
    userStory: overrides.userStory ?? null,
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    nonGoals: overrides.nonGoals ?? [],
    targetUsers: overrides.targetUsers ?? [],
    notesForQa: overrides.notesForQa ?? [],
    sourceRefs: overrides.sourceRefs ?? [],
    extractionStatus: overrides.extractionStatus ?? "parsed",
  };
}

function makePrIntake(
  overrides: Partial<PersistedPrIntake> = {},
): PersistedPrIntake {
  return {
    id: 1,
    provider: "github",
    repository: "owner/repo",
    prNumber: 42,
    title: overrides.title ?? "Test PR",
    description: "",
    author: "dev",
    baseBranch: "main",
    headBranch: "feature",
    headSha: "abc123",
    linkedIssues: [],
    changedFiles: overrides.changedFiles ?? [
      {
        path: "src/pages/concerts/page.tsx",
        status: "modified",
        additions: 10,
        deletions: 2,
        previousPath: null,
      },
      {
        path: "src/components/ConcertList.tsx",
        status: "added",
        additions: 50,
        deletions: 0,
        previousPath: null,
      },
    ],
    reviewComments: [],
    fetchedAt: "2025-01-01T00:00:00Z",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function makeChangeAnalysis(
  overrides: Partial<PersistedChangeAnalysis> = {},
): PersistedChangeAnalysis {
  return {
    id: 1,
    prIntakeId: 1,
    fileAnalyses: overrides.fileAnalyses ?? [
      {
        path: "src/pages/concerts/page.tsx",
        status: "modified",
        additions: 10,
        deletions: 2,
        categories: [
          { category: "ui", confidence: 0.8, reason: "React component" },
        ],
      },
      {
        path: "src/components/ConcertList.tsx",
        status: "added",
        additions: 50,
        deletions: 0,
        categories: [
          { category: "ui", confidence: 0.8, reason: "React component" },
        ],
      },
    ],
    relatedCodes: [],
    viewpointSeeds: [],
    summary: "test",
    analyzedAt: "2025-01-01T00:00:00Z",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function makeTestMapping(
  overrides: Partial<PersistedTestMapping> = {},
): PersistedTestMapping {
  return {
    id: 1,
    changeAnalysisId: 1,
    prIntakeId: 1,
    testAssets: overrides.testAssets ?? [
      {
        path: "tests/unit/ConcertList.test.tsx",
        layer: "unit",
        relatedTo: ["src/components/ConcertList.tsx"],
        confidence: 0.7,
        stability: "stable",
        stabilitySignals: [],
        stabilityNotes: [],
      },
    ],
    testSummaries: overrides.testSummaries ?? [],
    coverageGapMap: [],
    missingLayers: overrides.missingLayers ?? ["e2e", "visual"],
    mappedAt: "2025-01-01T00:00:00Z",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function makeAllocationItem(
  overrides: Partial<PersistedAllocationItem>,
): PersistedAllocationItem {
  return {
    id: overrides.id ?? 1,
    riskAssessmentId: 1,
    title: overrides.title ?? "Test item",
    changedFilePaths: overrides.changedFilePaths ?? [
      "src/components/ConcertList.tsx",
    ],
    riskLevel: overrides.riskLevel ?? "medium",
    recommendedDestination: overrides.recommendedDestination ?? "unit",
    confidence: overrides.confidence ?? 0.8,
    rationale: "test rationale",
    sourceSignals: overrides.sourceSignals ?? {
      categories: ["ui"],
      existingTestLayers: [],
      gapAspects: ["happy-path"],
      reviewComments: [],
      riskSignals: [],
    },
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

describe("buildHandoffViewModel", () => {
  it("derives requirements from acceptance criteria when available", () => {
    const vm = buildHandoffViewModel({
      intentContext: makeIntentContext({
        acceptanceCriteria: [
          "/concerts にアクセスするとアーカイブ一覧が表示される",
          "Footer に「演奏会アーカイブ」リンクが表示される",
        ],
      }),
      allocationItems: [],
      testMapping: makeTestMapping(),
      changeAnalysis: makeChangeAnalysis(),
      prIntake: makePrIntake(),
    });

    expect(vm.requirements).toHaveLength(2);
    expect(vm.requirements[0].requirement).toBe(
      "/concerts にアクセスするとアーカイブ一覧が表示される",
    );
    expect(vm.requirements[1].requirement).toBe(
      "Footer に「演奏会アーカイブ」リンクが表示される",
    );
  });

  it("falls back to file-based requirements when no acceptance criteria", () => {
    const vm = buildHandoffViewModel({
      intentContext: null,
      allocationItems: [],
      testMapping: makeTestMapping(),
      changeAnalysis: makeChangeAnalysis(),
      prIntake: makePrIntake(),
    });

    expect(vm.requirements.length).toBeGreaterThan(0);
    // UI category detected, so at least one requirement about UI
    expect(vm.requirements.some((r) => r.requirement.includes("UI"))).toBe(
      true,
    );
  });

  it("attaches relatedTests via sourceFiles fallback for generic criteria", () => {
    const vm = buildHandoffViewModel({
      intentContext: makeIntentContext({
        acceptanceCriteria: ["アーカイブ一覧が表示されること"],
      }),
      allocationItems: [],
      testMapping: makeTestMapping(),
      changeAnalysis: makeChangeAnalysis(),
      prIntake: makePrIntake(),
    });

    // Generic criterion should still get related tests through fallback
    expect(vm.requirements).toHaveLength(1);
    expect(vm.requirements[0].sourceFiles.length).toBeGreaterThan(0);
    expect(vm.requirements[0].relatedTests.length).toBeGreaterThan(0);
    expect(vm.requirements[0].relatedTests).toContain(
      "tests/unit/ConcertList.test.tsx",
    );
  });

  it("includes uncategorized product files in mixed PRs", () => {
    const vm = buildHandoffViewModel({
      intentContext: null,
      allocationItems: [],
      testMapping: makeTestMapping({ testAssets: [] }),
      changeAnalysis: makeChangeAnalysis({
        fileAnalyses: [
          {
            path: "src/middleware/auth.ts",
            status: "modified",
            additions: 5,
            deletions: 1,
            categories: [
              { category: "permission", confidence: 0.9, reason: "auth" },
            ],
          },
          {
            path: "src/utils/format.ts",
            status: "modified",
            additions: 3,
            deletions: 1,
            categories: [],
          },
        ],
      }),
      prIntake: makePrIntake({
        changedFiles: [
          {
            path: "src/middleware/auth.ts",
            status: "modified",
            additions: 5,
            deletions: 1,
            previousPath: null,
          },
          {
            path: "src/utils/format.ts",
            status: "modified",
            additions: 3,
            deletions: 1,
            previousPath: null,
          },
        ],
      }),
    });

    const reqTexts = vm.requirements.map((r) => r.requirement);
    // Both categorized and uncategorized should appear
    expect(reqTexts.some((r) => r.includes("権限制御"))).toBe(true);
    expect(reqTexts.some((r) => r.includes("変更確認"))).toBe(true);
  });

  it("excludes lockfiles and test files from requirements", () => {
    const vm = buildHandoffViewModel({
      intentContext: null,
      allocationItems: [],
      testMapping: makeTestMapping({ testAssets: [] }),
      changeAnalysis: makeChangeAnalysis({
        fileAnalyses: [
          {
            path: "src/app.tsx",
            status: "modified",
            additions: 1,
            deletions: 1,
            categories: [{ category: "ui", confidence: 0.8, reason: "React" }],
          },
        ],
      }),
      prIntake: makePrIntake({
        changedFiles: [
          {
            path: "src/app.tsx",
            status: "modified",
            additions: 1,
            deletions: 1,
            previousPath: null,
          },
          {
            path: "package-lock.json",
            status: "modified",
            additions: 100,
            deletions: 50,
            previousPath: null,
          },
          {
            path: "tests/unit/foo.test.ts",
            status: "added",
            additions: 20,
            deletions: 0,
            previousPath: null,
          },
        ],
      }),
    });

    const allSourceFiles = vm.requirements.flatMap((r) => r.sourceFiles);
    expect(allSourceFiles).not.toContain("package-lock.json");
    expect(allSourceFiles).not.toContain("tests/unit/foo.test.ts");
  });

  it("puts notesForQa in notes, not requirements", () => {
    const vm = buildHandoffViewModel({
      intentContext: makeIntentContext({
        acceptanceCriteria: ["画面が表示される"],
        notesForQa: ["Storybook で視覚確認推奨"],
      }),
      allocationItems: [],
      testMapping: makeTestMapping(),
      changeAnalysis: makeChangeAnalysis(),
      prIntake: makePrIntake(),
    });

    expect(vm.notes).toContain("Storybook で視覚確認推奨");
    const reqTexts = vm.requirements.map((r) => r.requirement);
    expect(reqTexts).not.toContain("Storybook で視覚確認推奨");
  });

  it("includes missing layers in notes", () => {
    const vm = buildHandoffViewModel({
      intentContext: null,
      allocationItems: [],
      testMapping: makeTestMapping({ missingLayers: ["e2e", "api"] }),
      changeAnalysis: makeChangeAnalysis(),
      prIntake: makePrIntake(),
    });

    expect(vm.notes.some((n) => n.includes("テストレイヤー未整備"))).toBe(true);
    expect(vm.notes.some((n) => n.includes("e2e"))).toBe(true);
  });
});

describe("deriveDisplayTestLayers", () => {
  it("derives layers from test assets", () => {
    const layers = deriveDisplayTestLayers({
      testAssets: [
        {
          path: "tests/unit/foo.test.ts",
          layer: "unit",
          relatedTo: ["src/foo.ts"],
          confidence: 0.7,
          stability: "stable",
          stabilitySignals: [],
          stabilityNotes: [],
        },
        {
          path: "stories/foo.stories.tsx",
          layer: "storybook",
          relatedTo: ["src/foo.tsx"],
          confidence: 0.6,
          stability: "stable",
          stabilitySignals: [],
          stabilityNotes: [],
        },
      ],
      allocationItems: [],
      fileAnalyses: [],
    });

    expect(layers).toContain("単体テスト");
    expect(layers).toContain("ビジュアルテスト");
    expect(layers).not.toContain("E2Eテスト");
  });

  it("derives layers from allocation destinations", () => {
    const layers = deriveDisplayTestLayers({
      testAssets: [],
      allocationItems: [
        makeAllocationItem({ recommendedDestination: "e2e" }),
        makeAllocationItem({ id: 2, recommendedDestination: "integration" }),
      ],
      fileAnalyses: [],
    });

    expect(layers).toContain("E2Eテスト");
    expect(layers).toContain("統合テスト");
  });

  it("derives サービステスト from file categories", () => {
    const layers = deriveDisplayTestLayers({
      testAssets: [],
      allocationItems: [],
      fileAnalyses: [
        {
          path: "src/api/handler.ts",
          status: "modified",
          additions: 5,
          deletions: 1,
          categories: [
            { category: "api", confidence: 0.8, reason: "API handler" },
          ],
        },
      ],
    });

    expect(layers).toContain("サービステスト");
  });
});
