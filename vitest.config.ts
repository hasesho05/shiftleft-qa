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
    include: ["tests/**/*.test.ts"],
    hookTimeout: 20000,
    server: {
      deps: {
        external: [],
      },
    },
    testTimeout: 20000,
  },
});
