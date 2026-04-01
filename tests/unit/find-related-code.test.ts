import { describe, expect, it } from "vitest";

import { findRelatedCodeCandidates } from "../../src/exploratory-testing/analysis/find-related-code";
import type { ChangedFile } from "../../src/exploratory-testing/models/pr-intake";

function makeFiles(paths: readonly string[]): readonly ChangedFile[] {
  return paths.map((path) => ({
    path,
    status: "modified" as const,
    additions: 5,
    deletions: 2,
    previousPath: null,
  }));
}

describe("findRelatedCodeCandidates", () => {
  it("infers test file candidates from source files", () => {
    const files = makeFiles(["src/components/Button.tsx"]);

    const candidates = findRelatedCodeCandidates(files);
    const testCandidates = candidates.filter((c) => c.relation === "test");

    expect(testCandidates.length).toBeGreaterThanOrEqual(1);
    expect(
      testCandidates.some(
        (c) => c.path.includes("Button.test") || c.path.includes("Button.spec"),
      ),
    ).toBe(true);
  });

  it("infers source file candidates from test files", () => {
    const files = makeFiles(["tests/unit/auth.test.ts"]);

    const candidates = findRelatedCodeCandidates(files);
    const importCandidates = candidates.filter((c) => c.relation === "import");

    expect(importCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it("infers co-located files from same directory", () => {
    const files = makeFiles([
      "src/features/auth/login.ts",
      "src/features/auth/register.ts",
    ]);

    const candidates = findRelatedCodeCandidates(files);
    const colocated = candidates.filter((c) => c.relation === "co-located");

    // index.ts in the same directory is a common co-located candidate
    expect(
      colocated.some((c) => c.path.includes("src/features/auth/index")),
    ).toBe(true);
  });

  it("does not produce type-definition candidates (not yet implemented)", () => {
    const files = makeFiles(["src/models/user.ts"]);

    const candidates = findRelatedCodeCandidates(files);
    const typeDefs = candidates.filter((c) => c.relation === "type-definition");

    expect(typeDefs).toHaveLength(0);
  });

  it("produces test and co-located candidates for API route files", () => {
    const files = makeFiles(["src/api/routes.ts"]);

    const candidates = findRelatedCodeCandidates(files);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.relation === "test")).toBe(true);
  });

  it("preserves nested directory structure in test path candidates", () => {
    const files = makeFiles(["src/features/auth/login.ts"]);

    const candidates = findRelatedCodeCandidates(files);
    const testCandidates = candidates.filter((c) => c.relation === "test");

    expect(
      testCandidates.some(
        (c) => c.path === "tests/unit/features/auth/login.test.ts",
      ),
    ).toBe(true);
  });

  it("deduplicates candidates by path", () => {
    const files = makeFiles(["src/utils/format.ts", "src/utils/parse.ts"]);

    const candidates = findRelatedCodeCandidates(files);
    const paths = candidates.map((c) => c.path);
    const uniquePaths = [...new Set(paths)];

    expect(paths.length).toBe(uniquePaths.length);
  });

  it("excludes changed files themselves from candidates", () => {
    const files = makeFiles(["src/index.ts"]);

    const candidates = findRelatedCodeCandidates(files);

    expect(candidates.every((c) => c.path !== "src/index.ts")).toBe(true);
  });

  it("returns empty array when no files given", () => {
    const candidates = findRelatedCodeCandidates([]);

    expect(candidates).toEqual([]);
  });
});
