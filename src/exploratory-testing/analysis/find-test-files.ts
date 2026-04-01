import posixPath from "node:path/posix";

import type { ChangedFile } from "../models/pr-intake";
import type { TestAsset, TestLayer } from "../models/test-mapping";

export function findTestAssets(
  changedFiles: readonly ChangedFile[],
): readonly TestAsset[] {
  const seen = new Set<string>();
  const assets: TestAsset[] = [];

  for (const file of changedFiles) {
    if (isTestFile(file.path)) {
      continue;
    }

    const candidates = inferTestCandidates(file.path);

    for (const candidate of candidates) {
      if (seen.has(candidate.path)) {
        continue;
      }
      seen.add(candidate.path);
      assets.push(candidate);
    }
  }

  return assets;
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
  candidates.push({
    path: posixPath.join(dir, `${name}.test${ext}`),
    layer: "unit",
    relatedTo: [sourcePath],
    confidence: 0.7,
  });

  // Spec style: src/middleware/auth.spec.ts
  candidates.push({
    path: posixPath.join(dir, `${name}.spec${ext}`),
    layer: "unit",
    relatedTo: [sourcePath],
    confidence: 0.6,
  });

  // tests/unit/<relative>/<name>.test.ts
  if (sourcePath.startsWith("src/")) {
    const relativeDir = posixPath.dirname(sourcePath.slice("src/".length));
    const testBase =
      relativeDir === "." ? "tests/unit" : `tests/unit/${relativeDir}`;
    candidates.push({
      path: posixPath.join(testBase, `${name}.test${ext}`),
      layer: "unit",
      relatedTo: [sourcePath],
      confidence: 0.6,
    });
  } else {
    candidates.push({
      path: posixPath.join("tests", `${name}.test${ext}`),
      layer: "unit",
      relatedTo: [sourcePath],
      confidence: 0.5,
    });
  }

  // __tests__/<name>.test.ts
  candidates.push({
    path: posixPath.join(dir, "__tests__", `${name}.test${ext}`),
    layer: "unit",
    relatedTo: [sourcePath],
    confidence: 0.55,
  });

  return candidates;
}

function inferE2ETests(sourcePath: string, name: string): readonly TestAsset[] {
  const candidates: TestAsset[] = [];

  candidates.push({
    path: `e2e/${name}.spec.ts`,
    layer: "e2e",
    relatedTo: [sourcePath],
    confidence: 0.4,
  });

  candidates.push({
    path: `tests/e2e/${name}.spec.ts`,
    layer: "e2e",
    relatedTo: [sourcePath],
    confidence: 0.4,
  });

  candidates.push({
    path: `cypress/e2e/${name}.cy.ts`,
    layer: "e2e",
    relatedTo: [sourcePath],
    confidence: 0.35,
  });

  return candidates;
}

function inferVisualTests(
  sourcePath: string,
  dir: string,
  name: string,
  ext: string,
): readonly TestAsset[] {
  const candidates: TestAsset[] = [];

  candidates.push({
    path: posixPath.join(dir, `${name}.visual${ext}`),
    layer: "visual",
    relatedTo: [sourcePath],
    confidence: 0.4,
  });

  candidates.push({
    path: `tests/visual/${name}.visual${ext}`,
    layer: "visual",
    relatedTo: [sourcePath],
    confidence: 0.35,
  });

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

  candidates.push({
    path: posixPath.join(dir, `${name}.stories${storyExt}`),
    layer: "storybook",
    relatedTo: [sourcePath],
    confidence: 0.6,
  });

  candidates.push({
    path: `stories/${name}.stories${storyExt}`,
    layer: "storybook",
    relatedTo: [sourcePath],
    confidence: 0.4,
  });

  return candidates;
}

function inferAPITests(sourcePath: string, name: string): readonly TestAsset[] {
  const candidates: TestAsset[] = [];

  candidates.push({
    path: `tests/api/${name}.test.ts`,
    layer: "api",
    relatedTo: [sourcePath],
    confidence: 0.5,
  });

  candidates.push({
    path: `tests/api/${name}.spec.ts`,
    layer: "api",
    relatedTo: [sourcePath],
    confidence: 0.45,
  });

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
