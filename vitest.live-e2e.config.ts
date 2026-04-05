import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "bun:sqlite": resolve(__dirname, "tests/helpers/bun-sqlite-shim.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/live-e2e/**/*.test.ts"],
    hookTimeout: 120000,
    server: {
      deps: {
        external: [],
      },
    },
    testTimeout: 120000,
  },
});
