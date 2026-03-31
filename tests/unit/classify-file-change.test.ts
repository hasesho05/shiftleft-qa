import { describe, expect, it } from "vitest";

import { classifyFileChange } from "../../src/exploratory-testing/analysis/classify-file-change";
import type { ChangedFile } from "../../src/exploratory-testing/models/pr-intake";

function makeFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: "src/index.ts",
    status: "modified",
    additions: 5,
    deletions: 2,
    previousPath: null,
    ...overrides,
  };
}

describe("classifyFileChange", () => {
  describe("UI classification", () => {
    it("classifies React component files as ui", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/components/Button.tsx" }),
      );

      const uiCategory = result.find((c) => c.category === "ui");
      expect(uiCategory).toBeDefined();
      expect(uiCategory?.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("classifies Vue SFC files as ui", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/components/Modal.vue" }),
      );

      expect(result.some((c) => c.category === "ui")).toBe(true);
    });

    it("classifies CSS/SCSS files as ui", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/styles/button.scss" }),
      );

      expect(result.some((c) => c.category === "ui")).toBe(true);
    });

    it("classifies Storybook stories as ui", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/components/Button.stories.tsx" }),
      );

      expect(result.some((c) => c.category === "ui")).toBe(true);
    });
  });

  describe("API classification", () => {
    it("classifies route/controller files as api", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/routes/users.ts" }),
      );

      expect(result.some((c) => c.category === "api")).toBe(true);
    });

    it("classifies handler files as api", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/handlers/createUser.ts" }),
      );

      expect(result.some((c) => c.category === "api")).toBe(true);
    });

    it("classifies API endpoint files as api", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/api/v2/users.ts" }),
      );

      expect(result.some((c) => c.category === "api")).toBe(true);
    });
  });

  describe("validation classification", () => {
    it("classifies validator files as validation", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/validators/userInput.ts" }),
      );

      expect(result.some((c) => c.category === "validation")).toBe(true);
    });

    it("classifies schema files as validation", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/schemas/createUser.ts" }),
      );

      expect(result.some((c) => c.category === "validation")).toBe(true);
    });
  });

  describe("state-transition classification", () => {
    it("classifies state/store files as state-transition", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/store/authSlice.ts" }),
      );

      expect(result.some((c) => c.category === "state-transition")).toBe(true);
    });

    it("classifies reducer files as state-transition", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/reducers/cart.ts" }),
      );

      expect(result.some((c) => c.category === "state-transition")).toBe(true);
    });
  });

  describe("permission classification", () => {
    it("classifies auth/permission files as permission", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/middleware/auth.ts" }),
      );

      expect(result.some((c) => c.category === "permission")).toBe(true);
    });

    it("classifies RBAC files as permission", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/rbac/roles.ts" }),
      );

      expect(result.some((c) => c.category === "permission")).toBe(true);
    });
  });

  describe("async classification", () => {
    it("classifies queue/worker files as async", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/workers/emailWorker.ts" }),
      );

      expect(result.some((c) => c.category === "async")).toBe(true);
    });

    it("classifies job files as async", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/jobs/syncData.ts" }),
      );

      expect(result.some((c) => c.category === "async")).toBe(true);
    });
  });

  describe("schema classification", () => {
    it("classifies migration files as schema", () => {
      const result = classifyFileChange(
        makeFile({ path: "db/migrations/001_create_users.sql" }),
      );

      expect(result.some((c) => c.category === "schema")).toBe(true);
    });

    it("classifies Prisma schema as schema", () => {
      const result = classifyFileChange(
        makeFile({ path: "prisma/schema.prisma" }),
      );

      expect(result.some((c) => c.category === "schema")).toBe(true);
    });
  });

  describe("shared-component classification", () => {
    it("classifies shared/common files as shared-component", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/shared/utils.ts" }),
      );

      expect(result.some((c) => c.category === "shared-component")).toBe(true);
    });

    it("classifies lib files as shared-component", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/lib/formatting.ts" }),
      );

      expect(result.some((c) => c.category === "shared-component")).toBe(true);
    });
  });

  describe("feature-flag classification", () => {
    it("classifies feature flag files as feature-flag", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/features/flags.ts" }),
      );

      expect(result.some((c) => c.category === "feature-flag")).toBe(true);
    });

    it("classifies feature toggle config as feature-flag", () => {
      const result = classifyFileChange(
        makeFile({ path: "config/feature-toggles.json" }),
      );

      expect(result.some((c) => c.category === "feature-flag")).toBe(true);
    });
  });

  describe("cross-service classification", () => {
    it("classifies proto/gRPC files as cross-service", () => {
      const result = classifyFileChange(
        makeFile({ path: "proto/user-service.proto" }),
      );

      expect(result.some((c) => c.category === "cross-service")).toBe(true);
    });

    it("classifies OpenAPI spec as cross-service", () => {
      const result = classifyFileChange(makeFile({ path: "api/openapi.yaml" }));

      expect(result.some((c) => c.category === "cross-service")).toBe(true);
    });
  });

  describe("multiple categories", () => {
    it("assigns both api and validation to an API validator file", () => {
      const result = classifyFileChange(
        makeFile({ path: "src/api/validators/userInput.ts" }),
      );

      const categories = result.map((c) => c.category);
      expect(categories).toContain("api");
      expect(categories).toContain("validation");
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty array for unclassifiable files", () => {
      const result = classifyFileChange(makeFile({ path: "README.md" }));

      expect(result).toHaveLength(0);
    });
  });
});
