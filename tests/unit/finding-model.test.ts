import { describe, expect, it } from "vitest";

import {
  findingSchema,
  findingTypeSchema,
  recommendedTestLayerSchema,
} from "../../src/exploratory-testing/models/finding";

describe("finding model schemas", () => {
  describe("findingTypeSchema", () => {
    const VALID_TYPES = ["defect", "spec-gap", "automation-candidate"] as const;

    it("accepts all 3 valid finding types", () => {
      for (const type of VALID_TYPES) {
        expect(findingTypeSchema.parse(type)).toBe(type);
      }
    });

    it("rejects unknown finding types", () => {
      expect(() => findingTypeSchema.parse("bug")).toThrow();
      expect(() => findingTypeSchema.parse("improvement")).toThrow();
    });
  });

  describe("recommendedTestLayerSchema", () => {
    const VALID_LAYERS = [
      "unit",
      "integration",
      "e2e",
      "visual",
      "api",
    ] as const;

    it("accepts all 5 valid test layers", () => {
      for (const layer of VALID_LAYERS) {
        expect(recommendedTestLayerSchema.parse(layer)).toBe(layer);
      }
    });

    it("rejects unknown test layers", () => {
      expect(() => recommendedTestLayerSchema.parse("manual")).toThrow();
    });
  });

  describe("findingSchema", () => {
    it("accepts a defect finding without automation fields", () => {
      const finding = {
        sessionId: 1,
        observationId: 2,
        type: "defect" as const,
        title: "Login button unresponsive after timeout",
        description:
          "Clicking login after session timeout shows spinner forever",
        severity: "high" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(findingSchema.parse(finding)).toEqual(finding);
    });

    it("accepts a spec-gap finding", () => {
      const finding = {
        sessionId: 1,
        observationId: 3,
        type: "spec-gap" as const,
        title: "No spec for concurrent edit conflict",
        description: "Behavior undefined when two users edit the same record",
        severity: "medium" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(findingSchema.parse(finding)).toEqual(finding);
    });

    it("accepts an automation-candidate finding with test layer", () => {
      const finding = {
        sessionId: 1,
        observationId: 4,
        type: "automation-candidate" as const,
        title: "Boundary value validation for amount field",
        description: "Min/max boundary values should be tested automatically",
        severity: "medium" as const,
        recommendedTestLayer: "unit" as const,
        automationRationale: "Deterministic boundary check, easy to automate",
      };
      expect(findingSchema.parse(finding)).toEqual(finding);
    });

    it("requires non-empty title", () => {
      const finding = {
        sessionId: 1,
        observationId: 2,
        type: "defect" as const,
        title: "",
        description: "Something",
        severity: "low" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(() => findingSchema.parse(finding)).toThrow();
    });

    it("requires non-empty description", () => {
      const finding = {
        sessionId: 1,
        observationId: 2,
        type: "defect" as const,
        title: "A finding",
        description: "",
        severity: "low" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(() => findingSchema.parse(finding)).toThrow();
    });

    it("requires positive sessionId", () => {
      const finding = {
        sessionId: 0,
        observationId: 2,
        type: "defect" as const,
        title: "A finding",
        description: "Details",
        severity: "low" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(() => findingSchema.parse(finding)).toThrow();
    });

    it("requires positive observationId", () => {
      const finding = {
        sessionId: 1,
        observationId: 0,
        type: "defect" as const,
        title: "A finding",
        description: "Details",
        severity: "low" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(() => findingSchema.parse(finding)).toThrow();
    });

    it("rejects automation-candidate without recommendedTestLayer", () => {
      const finding = {
        sessionId: 1,
        observationId: 4,
        type: "automation-candidate" as const,
        title: "Boundary value validation",
        description: "Should be automated",
        severity: "medium" as const,
        recommendedTestLayer: null,
        automationRationale: "Some rationale",
      };
      expect(() => findingSchema.parse(finding)).toThrow();
    });

    it("rejects automation-candidate without automationRationale", () => {
      const finding = {
        sessionId: 1,
        observationId: 4,
        type: "automation-candidate" as const,
        title: "Boundary value validation",
        description: "Should be automated",
        severity: "medium" as const,
        recommendedTestLayer: "unit" as const,
        automationRationale: null,
      };
      expect(() => findingSchema.parse(finding)).toThrow();
    });

    it("allows null recommendedTestLayer for defect", () => {
      const finding = {
        sessionId: 1,
        observationId: 2,
        type: "defect" as const,
        title: "A bug",
        description: "Details",
        severity: "high" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(findingSchema.parse(finding)).toEqual(finding);
    });

    it("allows null recommendedTestLayer for spec-gap", () => {
      const finding = {
        sessionId: 1,
        observationId: 2,
        type: "spec-gap" as const,
        title: "A gap",
        description: "Details",
        severity: "medium" as const,
        recommendedTestLayer: null,
        automationRationale: null,
      };
      expect(findingSchema.parse(finding)).toEqual(finding);
    });

    it("accepts all severity levels", () => {
      for (const severity of ["low", "medium", "high", "critical"]) {
        const finding = {
          sessionId: 1,
          observationId: 2,
          type: "defect" as const,
          title: "A finding",
          description: "Details",
          severity,
          recommendedTestLayer: null,
          automationRationale: null,
        };
        expect(findingSchema.parse(finding).severity).toBe(severity);
      }
    });
  });
});
