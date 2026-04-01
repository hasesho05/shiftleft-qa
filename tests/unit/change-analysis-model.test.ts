import { describe, expect, it } from "vitest";

import {
  type ChangeAnalysisResult,
  type FileChangeAnalysis,
  type RelatedCodeCandidate,
  type ViewpointSeed,
  changeAnalysisResultSchema,
  changeCategorySchema,
  fileChangeAnalysisSchema,
  relatedCodeCandidateSchema,
  viewpointSeedSchema,
} from "../../src/exploratory-testing/models/change-analysis";

describe("change-analysis model schemas", () => {
  describe("changeCategorySchema", () => {
    it("accepts all valid categories", () => {
      const categories = [
        "ui",
        "api",
        "validation",
        "state-transition",
        "permission",
        "async",
        "schema",
        "shared-component",
        "feature-flag",
        "cross-service",
      ];

      for (const category of categories) {
        expect(changeCategorySchema.parse(category)).toBe(category);
      }
    });

    it("rejects invalid category", () => {
      expect(() => changeCategorySchema.parse("unknown")).toThrow();
    });
  });

  describe("fileChangeAnalysisSchema", () => {
    it("parses a valid file change analysis", () => {
      const input: FileChangeAnalysis = {
        path: "src/components/Button.tsx",
        status: "modified",
        additions: 10,
        deletions: 3,
        categories: [
          { category: "ui", confidence: 0.9, reason: "React component file" },
        ],
      };

      const result = fileChangeAnalysisSchema.parse(input);

      expect(result.path).toBe("src/components/Button.tsx");
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].confidence).toBe(0.9);
    });

    it("allows multiple categories per file", () => {
      const input: FileChangeAnalysis = {
        path: "src/api/users.ts",
        status: "modified",
        additions: 20,
        deletions: 5,
        categories: [
          { category: "api", confidence: 0.95, reason: "API endpoint file" },
          {
            category: "validation",
            confidence: 0.7,
            reason: "Contains input validation",
          },
        ],
      };

      const result = fileChangeAnalysisSchema.parse(input);

      expect(result.categories).toHaveLength(2);
    });

    it("rejects confidence outside 0-1 range", () => {
      const input = {
        path: "src/index.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        categories: [
          { category: "ui", confidence: 1.5, reason: "too confident" },
        ],
      };

      expect(() => fileChangeAnalysisSchema.parse(input)).toThrow();
    });

    it("rejects empty path", () => {
      const input = {
        path: "",
        status: "modified",
        additions: 0,
        deletions: 0,
        categories: [],
      };

      expect(() => fileChangeAnalysisSchema.parse(input)).toThrow();
    });
  });

  describe("relatedCodeCandidateSchema", () => {
    it("parses a valid related code candidate", () => {
      const input: RelatedCodeCandidate = {
        path: "tests/unit/button.test.ts",
        relation: "test",
        confidence: 0.85,
        reason: "Test file for Button component",
      };

      const result = relatedCodeCandidateSchema.parse(input);

      expect(result.path).toBe("tests/unit/button.test.ts");
      expect(result.relation).toBe("test");
    });

    it("accepts all valid relation types", () => {
      const relations = [
        "import",
        "export",
        "test",
        "config",
        "type-definition",
        "co-located",
        "shared-module",
      ];

      for (const relation of relations) {
        const input = {
          path: "some/path.ts",
          relation,
          confidence: 0.5,
          reason: "test reason",
        };

        expect(relatedCodeCandidateSchema.parse(input).relation).toBe(relation);
      }
    });
  });

  describe("viewpointSeedSchema", () => {
    it("parses valid viewpoint seeds", () => {
      const input: ViewpointSeed = {
        viewpoint: "functional-user-flow",
        seeds: ["Login flow affected by auth middleware change"],
      };

      const result = viewpointSeedSchema.parse(input);

      expect(result.viewpoint).toBe("functional-user-flow");
      expect(result.seeds).toHaveLength(1);
    });

    it("accepts all five viewpoints", () => {
      const viewpoints = [
        "functional-user-flow",
        "user-persona",
        "ui-look-and-feel",
        "data-and-error-handling",
        "architecture-cross-cutting",
      ];

      for (const viewpoint of viewpoints) {
        const input = {
          viewpoint,
          seeds: ["seed text"],
        };

        expect(viewpointSeedSchema.parse(input).viewpoint).toBe(viewpoint);
      }
    });

    it("allows empty seeds array", () => {
      const input = {
        viewpoint: "functional-user-flow",
        seeds: [],
      };

      // Empty seeds is valid — some viewpoints may not have material yet
      expect(viewpointSeedSchema.parse(input).seeds).toHaveLength(0);
    });
  });

  describe("changeAnalysisResultSchema", () => {
    it("parses a complete change analysis result", () => {
      const input: ChangeAnalysisResult = {
        prIntakeId: 1,
        fileAnalyses: [
          {
            path: "src/index.ts",
            status: "modified",
            additions: 5,
            deletions: 2,
            categories: [
              { category: "api", confidence: 0.8, reason: "API route file" },
            ],
          },
        ],
        relatedCodes: [
          {
            path: "tests/unit/index.test.ts",
            relation: "test",
            confidence: 0.9,
            reason: "Test for index module",
          },
        ],
        viewpointSeeds: [
          {
            viewpoint: "functional-user-flow",
            seeds: ["API endpoint change may affect client calls"],
          },
        ],
        summary: "API change in index.ts with test coverage",
        analyzedAt: "2026-04-01T00:00:00Z",
      };

      const result = changeAnalysisResultSchema.parse(input);

      expect(result.prIntakeId).toBe(1);
      expect(result.fileAnalyses).toHaveLength(1);
      expect(result.relatedCodes).toHaveLength(1);
      expect(result.viewpointSeeds).toHaveLength(1);
    });

    it("rejects non-positive prIntakeId", () => {
      const input = {
        prIntakeId: 0,
        fileAnalyses: [],
        relatedCodes: [],
        viewpointSeeds: [],
        summary: "empty",
        analyzedAt: "2026-04-01T00:00:00Z",
      };

      expect(() => changeAnalysisResultSchema.parse(input)).toThrow();
    });
  });
});
