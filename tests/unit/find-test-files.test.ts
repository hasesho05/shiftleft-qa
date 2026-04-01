import { describe, expect, it } from "vitest";

import { findTestAssets } from "../../src/exploratory-testing/analysis/find-test-files";
import type { ChangedFile } from "../../src/exploratory-testing/models/pr-intake";

function makeChangedFile(path: string): ChangedFile {
  return {
    path,
    status: "modified",
    additions: 10,
    deletions: 2,
    previousPath: null,
  };
}

describe("findTestAssets", () => {
  it("finds co-located unit test for source file", () => {
    const files = [makeChangedFile("src/middleware/auth.ts")];

    const assets = findTestAssets(files);

    const unitAssets = assets.filter((a) => a.layer === "unit");
    expect(unitAssets.length).toBeGreaterThan(0);
    expect(unitAssets.some((a) => a.path.includes("auth.test.ts"))).toBe(true);
  });

  it("finds spec-style test files", () => {
    const files = [makeChangedFile("src/components/Button.tsx")];

    const assets = findTestAssets(files);

    expect(assets.some((a) => a.path.includes("Button.spec.tsx"))).toBe(true);
  });

  it("finds e2e test candidates", () => {
    const files = [makeChangedFile("src/pages/login.tsx")];

    const assets = findTestAssets(files);

    const e2eAssets = assets.filter((a) => a.layer === "e2e");
    expect(e2eAssets.length).toBeGreaterThan(0);
  });

  it("finds storybook story candidates for UI components", () => {
    const files = [makeChangedFile("src/components/Card.tsx")];

    const assets = findTestAssets(files);

    const stories = assets.filter((a) => a.layer === "storybook");
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.some((a) => a.path.includes("Card.stories"))).toBe(true);
  });

  it("finds visual test candidates", () => {
    const files = [makeChangedFile("src/components/Modal.tsx")];

    const assets = findTestAssets(files);

    const visual = assets.filter((a) => a.layer === "visual");
    expect(visual.length).toBeGreaterThan(0);
  });

  it("finds API test candidates for api files", () => {
    const files = [makeChangedFile("src/api/users.ts")];

    const assets = findTestAssets(files);

    const apiAssets = assets.filter((a) => a.layer === "api");
    expect(apiAssets.length).toBeGreaterThan(0);
  });

  it("relates test assets back to their source files", () => {
    const files = [makeChangedFile("src/middleware/auth.ts")];

    const assets = findTestAssets(files);

    for (const asset of assets) {
      expect(asset.relatedTo).toContain("src/middleware/auth.ts");
    }
  });

  it("deduplicates test assets across multiple changed files", () => {
    const files = [
      makeChangedFile("src/middleware/auth.ts"),
      makeChangedFile("src/middleware/auth.ts"),
    ];

    const assets = findTestAssets(files);
    const paths = assets.map((a) => a.path);
    const uniquePaths = [...new Set(paths)];

    expect(paths.length).toBe(uniquePaths.length);
  });

  it("does not generate candidates for test files themselves", () => {
    const files = [makeChangedFile("tests/unit/auth.test.ts")];

    const assets = findTestAssets(files);

    expect(assets).toHaveLength(0);
  });

  it("handles files in __tests__ directory", () => {
    const files = [makeChangedFile("src/utils/format.ts")];

    const assets = findTestAssets(files);

    expect(
      assets.some((a) => a.path.includes("__tests__/format.test.ts")),
    ).toBe(true);
  });

  it("merges relatedTo when multiple source files share a test candidate", () => {
    const files = [
      makeChangedFile("src/middleware/auth.ts"),
      makeChangedFile("src/services/auth.ts"),
    ];

    const assets = findTestAssets(files);

    // Both source files generate e2e/auth.spec.ts as a candidate
    const e2eAsset = assets.find((a) => a.path === "e2e/auth.spec.ts");
    expect(e2eAsset).toBeDefined();
    expect(e2eAsset?.relatedTo).toContain("src/middleware/auth.ts");
    expect(e2eAsset?.relatedTo).toContain("src/services/auth.ts");
  });

  it("does not duplicate relatedTo entries for the same source file", () => {
    const files = [
      makeChangedFile("src/middleware/auth.ts"),
      makeChangedFile("src/middleware/auth.ts"),
    ];

    const assets = findTestAssets(files);

    for (const asset of assets) {
      const unique = [...new Set(asset.relatedTo)];
      expect(asset.relatedTo.length).toBe(unique.length);
    }
  });
});
