import { basename } from "node:path/posix";

const LOCKFILE_BASENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Gemfile.lock",
  "go.sum",
  "composer.lock",
]);

const LINT_FORMAT_BASENAMES = new Set([
  ".editorconfig",
  "biome.json",
  "biome.jsonc",
]);

const LINT_FORMAT_PATTERNS: readonly RegExp[] = [
  /^\.eslintrc/,
  /^\.prettierrc/,
  /^\.prettierignore$/,
  /^\.eslintignore$/,
];

/**
 * Returns true when the file is pure noise that can safely be excluded
 * from the analysis pipeline entirely (gap map, allocation, handoff).
 *
 * This is the "narrow" filter — only files that never affect product
 * behavior regardless of what changed inside them.
 */
export function isNonProductNoise(filePath: string): boolean {
  const base = basename(filePath);

  if (LOCKFILE_BASENAMES.has(base)) {
    return true;
  }

  if (isTestFile(filePath)) {
    return true;
  }

  if (isStorybookConfig(filePath)) {
    return true;
  }

  if (LINT_FORMAT_BASENAMES.has(base)) {
    return true;
  }

  if (LINT_FORMAT_PATTERNS.some((pattern) => pattern.test(base))) {
    return true;
  }

  return false;
}

/**
 * Returns true for infrastructure / build config files that should
 * remain in the analysis pipeline but may be handled differently
 * in the handoff rendering layer (e.g. grouped into a single
 * "infrastructure change" manual check item rather than individual
 * gap entries).
 */
export function isInfraConfig(filePath: string): boolean {
  const base = basename(filePath);

  // CI/CD
  if (
    /^\.github\//i.test(filePath) ||
    /(^|\/)\.gitlab-ci\.yml$/i.test(filePath)
  ) {
    return true;
  }

  // Container
  if (base === "Dockerfile" || /^docker-compose/i.test(base)) {
    return true;
  }

  // Build config
  if (/^tsconfig.*\.json$/i.test(base)) {
    return true;
  }
  if (/^(vite|vitest|webpack|jest)\.config\./i.test(base)) {
    return true;
  }

  // Metadata
  if (base === ".gitignore" || base === ".npmrc") {
    return true;
  }

  return false;
}

function isTestFile(filePath: string): boolean {
  return (
    /(^|\/)(__tests__|tests?|e2e|cypress|playwright)\//i.test(filePath) ||
    /\.(test|spec)\.[^.]+$/.test(filePath)
  );
}

function isStorybookConfig(filePath: string): boolean {
  return /(^|\/)\.storybook\//i.test(filePath);
}
