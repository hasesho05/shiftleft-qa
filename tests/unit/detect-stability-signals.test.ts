import { describe, expect, it } from "vitest";

import {
  type StabilityDetectionResult,
  detectStabilityFromPath,
  detectStabilityFromSource,
} from "../../src/exploratory-testing/analysis/detect-stability-signals";

describe("detectStabilityFromPath", () => {
  it("detects flaky from path containing 'flaky'", () => {
    const result = detectStabilityFromPath(
      "tests/e2e/flaky/order-page.spec.ts",
    );

    expect(result.stability).toBe("flaky");
    expect(result.signals).toContain("path:flaky");
  });

  it("detects quarantined from path containing 'quarantine'", () => {
    const result = detectStabilityFromPath("tests/quarantine/payment.spec.ts");

    expect(result.stability).toBe("quarantined");
    expect(result.signals).toContain("path:quarantine");
  });

  it("detects unstable from path containing 'unstable'", () => {
    const result = detectStabilityFromPath("tests/unstable/checkout.spec.ts");

    expect(result.stability).toBe("flaky");
    expect(result.signals).toContain("path:unstable");
  });

  it("returns unknown for normal test paths", () => {
    const result = detectStabilityFromPath("tests/unit/auth.test.ts");

    expect(result.stability).toBe("unknown");
    expect(result.signals).toHaveLength(0);
  });

  it("is case-insensitive for path matching", () => {
    const result = detectStabilityFromPath("tests/e2e/FLAKY/order.spec.ts");

    expect(result.stability).toBe("flaky");
  });

  it("detects flaky in filename itself", () => {
    const result = detectStabilityFromPath(
      "tests/e2e/order-page.flaky.spec.ts",
    );

    expect(result.stability).toBe("flaky");
    expect(result.signals).toContain("path:flaky");
  });

  it("quarantined takes precedence over flaky when both appear", () => {
    const result = detectStabilityFromPath(
      "tests/quarantine/flaky-order.spec.ts",
    );

    expect(result.stability).toBe("quarantined");
  });
});

describe("detectStabilityFromSource", () => {
  it("detects @flaky annotation in source text", () => {
    const source = `
      // @flaky
      describe("order page", () => {
        it("should complete checkout", () => {});
      });
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("flaky");
    expect(result.signals).toContain("annotation:@flaky");
  });

  it("detects @quarantined annotation", () => {
    const source = `
      // @quarantined
      it("should handle payment", () => {});
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("quarantined");
    expect(result.signals).toContain("annotation:@quarantined");
  });

  it("detects @unstable annotation as flaky", () => {
    const source = `
      // @unstable
      test("renders correctly", () => {});
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("flaky");
    expect(result.signals).toContain("annotation:@unstable");
  });

  it("returns unknown for source without annotations", () => {
    const source = `
      describe("auth", () => {
        it("should login", () => {});
      });
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("unknown");
    expect(result.signals).toHaveLength(0);
  });

  it("detects .skip as quarantined signal", () => {
    const source = `
      it.skip("broken test", () => {});
      describe.skip("disabled suite", () => {});
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("quarantined");
    expect(result.signals).toContain("pattern:skip");
  });

  it("detects test.todo as quarantined signal", () => {
    const source = `
      test.todo("need to implement this");
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("quarantined");
    expect(result.signals).toContain("pattern:todo");
  });

  it("quarantined takes precedence over flaky in source", () => {
    const source = `
      // @flaky
      // @quarantined
      it("broken", () => {});
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("quarantined");
  });

  it("detects flaky in comment lines", () => {
    const source = `
      // retry: 3 (flaky in CI)
      it("sometimes fails", () => {});
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("flaky");
  });

  it("does not match flaky in variable names or string literals", () => {
    const source = `
      const flakyRetryCount = 3;
      expect(message).toBe("this is flaky");
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("unknown");
  });

  it("detects flaky in block comments", () => {
    const source = `
      /* This test is flaky due to timing */
      it("races", () => {});
    `;

    const result = detectStabilityFromSource(source);

    expect(result.stability).toBe("flaky");
    expect(result.signals).toContain("comment:flaky");
  });
});
