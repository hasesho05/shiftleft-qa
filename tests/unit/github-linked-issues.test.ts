import { describe, expect, it } from "vitest";

import { parseLinkedIssueNumbers } from "../../src/exploratory-testing/scm/fetch-github";

describe("parseLinkedIssueNumbers", () => {
  it("extracts issue numbers from #N format", () => {
    const result = parseLinkedIssueNumbers(["#10", "#42"]);
    expect(result).toEqual([10, 42]);
  });

  it("handles empty array", () => {
    const result = parseLinkedIssueNumbers([]);
    expect(result).toEqual([]);
  });

  it("skips invalid formats", () => {
    const result = parseLinkedIssueNumbers(["#10", "not-a-ref", "#42"]);
    expect(result).toEqual([10, 42]);
  });

  it("handles refs without #", () => {
    const result = parseLinkedIssueNumbers(["10"]);
    expect(result).toEqual([]);
  });
});
