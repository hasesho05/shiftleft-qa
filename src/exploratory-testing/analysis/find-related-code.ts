import posixPath from "node:path/posix";

import type { RelatedCodeCandidate } from "../models/change-analysis";
import type { ChangedFile } from "../models/pr-intake";

export function findRelatedCodeCandidates(
  changedFiles: readonly ChangedFile[],
): readonly RelatedCodeCandidate[] {
  const changedPaths = new Set(changedFiles.map((f) => f.path));
  const candidateMap = new Map<string, RelatedCodeCandidate>();

  for (const file of changedFiles) {
    const inferred = inferCandidates(file.path);

    for (const candidate of inferred) {
      if (changedPaths.has(candidate.path)) {
        continue;
      }
      if (!candidateMap.has(candidate.path)) {
        candidateMap.set(candidate.path, candidate);
      }
    }
  }

  return [...candidateMap.values()];
}

function inferCandidates(filePath: string): readonly RelatedCodeCandidate[] {
  const candidates: RelatedCodeCandidate[] = [];

  if (isTestFile(filePath)) {
    candidates.push(...inferSourceFromTest(filePath));
  } else if (isSourceFile(filePath)) {
    candidates.push(...inferTestFromSource(filePath));
    candidates.push(...inferCoLocated(filePath));
  }

  return candidates;
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);
}

function isSourceFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(filePath) && !isTestFile(filePath);
}

function inferTestFromSource(
  sourcePath: string,
): readonly RelatedCodeCandidate[] {
  const dir = posixPath.dirname(sourcePath);
  const ext = posixPath.extname(sourcePath);
  const name = posixPath.basename(sourcePath, ext);
  const candidates: RelatedCodeCandidate[] = [];

  // Co-located test: src/components/Button.test.tsx
  candidates.push({
    path: posixPath.join(dir, `${name}.test${ext}`),
    relation: "test",
    confidence: 0.7,
    reason: `Co-located test file for ${name}${ext}`,
  });

  candidates.push({
    path: posixPath.join(dir, `${name}.spec${ext}`),
    relation: "test",
    confidence: 0.6,
    reason: `Co-located spec file for ${name}${ext}`,
  });

  // tests/unit/<relative-dir>/<name>.test.ts — preserve nested structure
  if (sourcePath.startsWith("src/")) {
    const relativeDir = posixPath.dirname(sourcePath.slice("src/".length));
    const testBase =
      relativeDir === "." ? "tests/unit" : `tests/unit/${relativeDir}`;
    candidates.push({
      path: posixPath.join(testBase, `${name}.test${ext}`),
      relation: "test",
      confidence: 0.6,
      reason: `Test file in tests directory for ${name}${ext}`,
    });
  } else {
    candidates.push({
      path: posixPath.join("tests", `${name}.test${ext}`),
      relation: "test",
      confidence: 0.5,
      reason: `Test file in tests directory for ${name}${ext}`,
    });
  }

  // __tests__/<name>.test.ts pattern
  candidates.push({
    path: posixPath.join(dir, "__tests__", `${name}.test${ext}`),
    relation: "test",
    confidence: 0.55,
    reason: `Test file in __tests__ directory for ${name}${ext}`,
  });

  return candidates;
}

function inferSourceFromTest(
  testPath: string,
): readonly RelatedCodeCandidate[] {
  const candidates: RelatedCodeCandidate[] = [];

  // Strip .test/.spec suffix to find source
  const stripped = testPath.replace(/\.(test|spec)(\.[^.]+)$/, "$2");

  if (stripped !== testPath) {
    // Same directory: tests/unit/auth.test.ts → tests/unit/auth.ts (unlikely but possible)
    candidates.push({
      path: stripped,
      relation: "import",
      confidence: 0.5,
      reason: "Source file inferred by removing test suffix",
    });

    // If in tests/ directory, map to src/
    const srcPath = stripped
      .replace(/^tests\/unit\//, "src/")
      .replace(/^tests\//, "src/");

    if (srcPath !== stripped) {
      candidates.push({
        path: srcPath,
        relation: "import",
        confidence: 0.65,
        reason: "Source file in src/ inferred from test path",
      });
    }
  }

  return candidates;
}

function inferCoLocated(sourcePath: string): readonly RelatedCodeCandidate[] {
  const dir = posixPath.dirname(sourcePath);
  const ext = posixPath.extname(sourcePath);
  const candidates: RelatedCodeCandidate[] = [];

  // index file in same directory
  candidates.push({
    path: posixPath.join(dir, `index${ext}`),
    relation: "co-located",
    confidence: 0.5,
    reason: `Index file in same directory (${dir})`,
  });

  return candidates;
}
