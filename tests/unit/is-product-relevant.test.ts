import { describe, expect, it } from "vitest";

import {
  isInfraConfig,
  isNonProductNoise,
} from "../../src/exploratory-testing/analysis/is-product-relevant";

describe("isNonProductNoise", () => {
  describe("lockfiles", () => {
    it.each([
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb",
      "Gemfile.lock",
      "go.sum",
      "composer.lock",
    ])("returns true for %s", (file) => {
      expect(isNonProductNoise(file)).toBe(true);
    });

    it("returns true for nested lockfile", () => {
      expect(isNonProductNoise("frontend/package-lock.json")).toBe(true);
    });
  });

  describe("test files", () => {
    it.each([
      "tests/unit/foo.test.ts",
      "src/__tests__/bar.spec.ts",
      "e2e/login.spec.ts",
      "cypress/integration/flow.test.js",
      "playwright/page.spec.ts",
      "src/components/Button.test.tsx",
      "test/helpers/setup.ts",
    ])("returns true for %s", (file) => {
      expect(isNonProductNoise(file)).toBe(true);
    });
  });

  describe("storybook config", () => {
    it("returns true for .storybook/ config files", () => {
      expect(isNonProductNoise(".storybook/main.ts")).toBe(true);
      expect(isNonProductNoise(".storybook/preview.ts")).toBe(true);
    });

    it("returns false for story files (not config)", () => {
      expect(isNonProductNoise("src/Button.stories.tsx")).toBe(false);
    });
  });

  describe("lint/format config", () => {
    it.each([
      ".eslintrc.js",
      ".eslintrc.json",
      ".eslintrc.cjs",
      ".prettierrc",
      ".prettierrc.json",
      ".editorconfig",
      "biome.json",
      "biome.jsonc",
      ".eslintignore",
      ".prettierignore",
    ])("returns true for %s", (file) => {
      expect(isNonProductNoise(file)).toBe(true);
    });
  });

  describe("product files", () => {
    it.each([
      "src/components/Button.tsx",
      "src/pages/index.ts",
      "src/middleware/auth.ts",
      "package.json",
      "src/Button.stories.tsx",
      "src/utils/format.ts",
      ".github/workflows/ci.yml",
      "Dockerfile",
      "tsconfig.json",
    ])("returns false for %s", (file) => {
      expect(isNonProductNoise(file)).toBe(false);
    });
  });
});

describe("isInfraConfig", () => {
  describe("CI/CD", () => {
    it.each([
      ".github/workflows/ci.yml",
      ".github/dependabot.yml",
      ".gitlab-ci.yml",
    ])("returns true for %s", (file) => {
      expect(isInfraConfig(file)).toBe(true);
    });
  });

  describe("container", () => {
    it.each(["Dockerfile", "docker-compose.yml", "docker-compose.prod.yml"])(
      "returns true for %s",
      (file) => {
        expect(isInfraConfig(file)).toBe(true);
      },
    );
  });

  describe("build config", () => {
    it.each([
      "tsconfig.json",
      "tsconfig.build.json",
      "vite.config.ts",
      "vitest.config.ts",
      "webpack.config.js",
      "jest.config.ts",
    ])("returns true for %s", (file) => {
      expect(isInfraConfig(file)).toBe(true);
    });
  });

  describe("metadata", () => {
    it.each([".gitignore", ".npmrc"])("returns true for %s", (file) => {
      expect(isInfraConfig(file)).toBe(true);
    });
  });

  describe("non-infra files", () => {
    it.each([
      "src/components/Button.tsx",
      "package.json",
      "src/middleware/auth.ts",
      "README.md",
    ])("returns false for %s", (file) => {
      expect(isInfraConfig(file)).toBe(false);
    });
  });
});
