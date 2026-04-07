import { existsSync } from "node:fs";
import { join } from "node:path";
import posixPath from "node:path/posix";

import type { ChangedFile } from "../models/pr-intake";
import type { TestAsset, TestLayer } from "../models/test-mapping";
import { detectStabilityFromPath } from "./detect-stability-signals";

function makeAsset(
  path: string,
  layer: TestLayer,
  relatedTo: readonly string[],
  confidence: number,
): TestAsset {
  const detection = detectStabilityFromPath(path);
  return {
    path,
    layer,
    relatedTo: [...relatedTo],
    confidence,
    stability: detection.stability,
    stabilitySignals: [...detection.signals],
    stabilityNotes: [],
  };
}

export function findTestAssets(
  changedFiles: readonly ChangedFile[],
  workspaceRoot: string | null = null,
): readonly TestAsset[] {
  const assetsMap = new Map<string, TestAsset>();

  for (const file of changedFiles) {
    if (isTestFile(file.path)) {
      continue;
    }

    const candidates = inferTestCandidates(file.path);

    for (const candidate of candidates) {
      const existing = assetsMap.get(candidate.path);
      if (existing) {
        const merged = mergeRelatedTo(existing.relatedTo, candidate.relatedTo);
        assetsMap.set(candidate.path, { ...existing, relatedTo: merged });
      } else {
        assetsMap.set(candidate.path, candidate);
      }
    }
  }

  if (workspaceRoot === null) {
    return [...assetsMap.values()];
  }

  // Filter out candidates whose files do not exist on disk
  const verified: TestAsset[] = [];
  for (const asset of assetsMap.values()) {
    if (existsSync(join(workspaceRoot, asset.path))) {
      verified.push(asset);
    }
  }
  return verified;
}

function mergeRelatedTo(
  existing: readonly string[],
  incoming: readonly string[],
): string[] {
  const merged = [...existing];
  for (const path of incoming) {
    if (!merged.includes(path)) {
      merged.push(path);
    }
  }
  return merged;
}

function isTestFile(filePath: string): boolean {
  return (
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) ||
    /\.stories\.(ts|tsx|js|jsx|mdx)$/.test(filePath)
  );
}

function inferTestCandidates(sourcePath: string): readonly TestAsset[] {
  const candidates: TestAsset[] = [];
  const dir = posixPath.dirname(sourcePath);
  const ext = posixPath.extname(sourcePath);
  const name = posixPath.basename(sourcePath, ext);

  // Unit tests
  candidates.push(...inferUnitTests(sourcePath, dir, name, ext));

  // E2E tests
  candidates.push(...inferE2ETests(sourcePath, name));

  // Visual tests
  if (isUIComponent(sourcePath)) {
    candidates.push(...inferVisualTests(sourcePath, dir, name, ext));
    candidates.push(...inferStorybookStories(sourcePath, dir, name, ext));
  }

  // API tests
  if (isAPIFile(sourcePath)) {
    candidates.push(...inferAPITests(sourcePath, name));
  }

  return candidates;
}

function inferUnitTests(
  sourcePath: string,
  dir: string,
  name: string,
  ext: string,
): readonly TestAsset[] {
  const candidates: TestAsset[] = [];

  // Co-located: src/middleware/auth.test.ts
  candidates.push(
    makeAsset(
      posixPath.join(dir, `${name}.test${ext}`),
      "unit",
      [sourcePath],
      0.7,
    ),
  );

  // Spec style: src/middleware/auth.spec.ts
  candidates.push(
    makeAsset(
      posixPath.join(dir, `${name}.spec${ext}`),
      "unit",
      [sourcePath],
      0.6,
    ),
  );

  // tests/unit/<relative>/<name>.test.ts
  if (sourcePath.startsWith("src/")) {
    const relativeDir = posixPath.dirname(sourcePath.slice("src/".length));
    const testBase =
      relativeDir === "." ? "tests/unit" : `tests/unit/${relativeDir}`;
    candidates.push(
      makeAsset(
        posixPath.join(testBase, `${name}.test${ext}`),
        "unit",
        [sourcePath],
        0.6,
      ),
    );
  } else {
    candidates.push(
      makeAsset(
        posixPath.join("tests", `${name}.test${ext}`),
        "unit",
        [sourcePath],
        0.5,
      ),
    );
  }

  // __tests__/<name>.test.ts
  candidates.push(
    makeAsset(
      posixPath.join(dir, "__tests__", `${name}.test${ext}`),
      "unit",
      [sourcePath],
      0.55,
    ),
  );

  return candidates;
}

function inferE2ETests(sourcePath: string, name: string): readonly TestAsset[] {
  const candidates: TestAsset[] = [];

  candidates.push(makeAsset(`e2e/${name}.spec.ts`, "e2e", [sourcePath], 0.4));
  candidates.push(
    makeAsset(`tests/e2e/${name}.spec.ts`, "e2e", [sourcePath], 0.4),
  );
  candidates.push(
    makeAsset(`cypress/e2e/${name}.cy.ts`, "e2e", [sourcePath], 0.35),
  );

  return candidates;
}

function inferVisualTests(
  sourcePath: string,
  dir: string,
  name: string,
  ext: string,
): readonly TestAsset[] {
  const candidates: TestAsset[] = [];

  candidates.push(
    makeAsset(
      posixPath.join(dir, `${name}.visual${ext}`),
      "visual",
      [sourcePath],
      0.4,
    ),
  );
  candidates.push(
    makeAsset(
      `tests/visual/${name}.visual${ext}`,
      "visual",
      [sourcePath],
      0.35,
    ),
  );

  return candidates;
}

function inferStorybookStories(
  sourcePath: string,
  dir: string,
  name: string,
  ext: string,
): readonly TestAsset[] {
  const storyExt = ext === ".tsx" || ext === ".jsx" ? ext : ".tsx";
  const candidates: TestAsset[] = [];

  candidates.push(
    makeAsset(
      posixPath.join(dir, `${name}.stories${storyExt}`),
      "storybook",
      [sourcePath],
      0.6,
    ),
  );
  candidates.push(
    makeAsset(
      `stories/${name}.stories${storyExt}`,
      "storybook",
      [sourcePath],
      0.4,
    ),
  );

  return candidates;
}

function inferAPITests(sourcePath: string, name: string): readonly TestAsset[] {
  const candidates: TestAsset[] = [];

  candidates.push(
    makeAsset(`tests/api/${name}.test.ts`, "api", [sourcePath], 0.5),
  );
  candidates.push(
    makeAsset(`tests/api/${name}.spec.ts`, "api", [sourcePath], 0.45),
  );

  return candidates;
}

function isUIComponent(filePath: string): boolean {
  return (
    /\.(tsx|jsx)$/.test(filePath) ||
    /components?\//.test(filePath) ||
    /pages?\//.test(filePath)
  );
}

function isAPIFile(filePath: string): boolean {
  return /api\//.test(filePath) || /routes?\//.test(filePath);
}
