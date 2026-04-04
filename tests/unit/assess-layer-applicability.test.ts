import { describe, expect, it } from "vitest";

import { assessLayerApplicability } from "../../src/exploratory-testing/analysis/assess-layer-applicability";
import type { AllocationDestination } from "../../src/exploratory-testing/models/allocation";
import type { FileChangeAnalysis } from "../../src/exploratory-testing/models/change-analysis";

function fileAnalysis(
  path: string,
  categories: readonly FileChangeAnalysis["categories"][number]["category"][],
): FileChangeAnalysis {
  return {
    path,
    status: "modified",
    additions: 10,
    deletions: 2,
    categories: categories.map((category) => ({
      category,
      confidence: 0.8,
      reason: category,
    })),
  };
}

function allocation(destination: AllocationDestination) {
  return { recommendedDestination: destination } as const;
}

describe("assess-layer-applicability", () => {
  it("marks integration as not-primary for frontend component-only changes", () => {
    const result = assessLayerApplicability({
      changedFilePaths: [
        "src/components/Button.tsx",
        "src/components/Button.test.tsx",
        "src/components/Button.stories.tsx",
      ],
      fileAnalyses: [fileAnalysis("src/components/Button.tsx", ["ui"])],
      allocationItems: [allocation("unit"), allocation("visual")],
    });

    expect(result.unit.status).toBe("primary");
    expect(result.visual.status).toBe("primary");
    expect(result["integration-service"].status).toBe("not-primary");
    expect(result["manual-exploration"].status).toBe("not-primary");
  });

  it("marks ui-e2e as primary for route-level frontend changes", () => {
    const result = assessLayerApplicability({
      changedFilePaths: ["src/routes/checkout/CheckoutPage.tsx"],
      fileAnalyses: [
        fileAnalysis("src/routes/checkout/CheckoutPage.tsx", ["ui"]),
      ],
      allocationItems: [allocation("e2e")],
    });

    expect(result["ui-e2e"].status).toBe("primary");
    expect(result.visual.status).toBe("primary");
  });

  it("marks integration as primary and visual as not-primary for backend-only changes", () => {
    const result = assessLayerApplicability({
      changedFilePaths: ["src/api/orders/create-order.ts"],
      fileAnalyses: [
        fileAnalysis("src/api/orders/create-order.ts", ["api", "async"]),
      ],
      allocationItems: [allocation("integration")],
    });

    expect(result["integration-service"].status).toBe("primary");
    expect(result.visual.status).toBe("not-primary");
    expect(result["ui-e2e"].status).toBe("not-primary");
  });

  it("marks visual primary and unit/integration not-primary for static asset replacement", () => {
    const result = assessLayerApplicability({
      changedFilePaths: ["public/forms/tax-return.pdf"],
      fileAnalyses: [fileAnalysis("public/forms/tax-return.pdf", [])],
      allocationItems: [allocation("visual")],
    });

    expect(result.visual.status).toBe("primary");
    expect(result.unit.status).toBe("not-primary");
    expect(result["integration-service"].status).toBe("not-primary");
    expect(result["manual-exploration"].status).toBe("secondary");
  });

  it("marks all layers as no-product-change for docs and tests only", () => {
    const result = assessLayerApplicability({
      changedFilePaths: ["README.md", "tests/unit/setup.test.ts"],
      fileAnalyses: [],
      allocationItems: [],
    });

    expect(result.unit.status).toBe("no-product-change");
    expect(result["integration-service"].status).toBe("no-product-change");
    expect(result["ui-e2e"].status).toBe("no-product-change");
    expect(result.visual.status).toBe("no-product-change");
    expect(result["manual-exploration"].status).toBe("no-product-change");
  });

  it("allows mixed ui and backend changes to make multiple layers primary", () => {
    const result = assessLayerApplicability({
      changedFilePaths: [
        "src/routes/profile/ProfilePage.tsx",
        "src/api/profile/update-profile.ts",
      ],
      fileAnalyses: [
        fileAnalysis("src/routes/profile/ProfilePage.tsx", ["ui"]),
        fileAnalysis("src/api/profile/update-profile.ts", ["api"]),
      ],
      allocationItems: [allocation("e2e"), allocation("integration")],
    });

    expect(result["ui-e2e"].status).toBe("primary");
    expect(result["integration-service"].status).toBe("primary");
  });

  it("treats permission changes as secondary manual applicability when no remainder exists", () => {
    const result = assessLayerApplicability({
      changedFilePaths: ["src/auth/role-policy.ts"],
      fileAnalyses: [fileAnalysis("src/auth/role-policy.ts", ["permission"])],
      allocationItems: [allocation("review")],
    });

    expect(result["integration-service"].status).toBe("secondary");
    expect(result["manual-exploration"].status).toBe("secondary");
    expect(result.visual.status).toBe("not-primary");
  });
});
