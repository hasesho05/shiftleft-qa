import { describe, expect, it } from "vitest";

import { parseIntentContext } from "../../src/exploratory-testing/scm/intent-parser";

describe("parseIntentContext", () => {
  describe("changePurpose extraction", () => {
    it("extracts 'feature' from Purpose heading", () => {
      const body = "## Purpose\nAdd a new dashboard feature\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("feature");
    });

    it("extracts 'bugfix' from 目的 heading", () => {
      const body = "## 目的\nバグ修正\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("bugfix");
    });

    it("extracts 'refactor' from purpose text", () => {
      const body = "## Purpose\nRefactor the authentication module\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("refactor");
    });

    it("extracts 'docs' from purpose text", () => {
      const body = "## Purpose\nUpdate documentation for API\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("docs");
    });

    it("extracts 'config' from purpose text", () => {
      const body = "## Purpose\nUpdate configuration settings\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("config");
    });

    it("returns null when no purpose section exists", () => {
      const body = "Just a simple PR\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBeNull();
    });

    it("does not false-positive on 'address' containing 'add'", () => {
      const body = "## Purpose\nAddress the performance regression\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).not.toBe("feature");
    });

    it("does not false-positive on 'prefix' containing 'fix'", () => {
      const body = "## Purpose\nPrefix all log messages with timestamps\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).not.toBe("bugfix");
    });
  });

  describe("userStory extraction", () => {
    it("extracts user story from User Story heading", () => {
      const body = "## User Story\nAs a user, I want to login with SSO\n";
      const result = parseIntentContext([body]);
      expect(result.userStory).toBe("As a user, I want to login with SSO");
    });

    it("extracts user story from ユーザーストーリー heading", () => {
      const body = "## ユーザーストーリー\nユーザーとしてログインしたい\n";
      const result = parseIntentContext([body]);
      expect(result.userStory).toBe("ユーザーとしてログインしたい");
    });

    it("returns null when no user story exists", () => {
      const body = "## Purpose\nJust some changes\n";
      const result = parseIntentContext([body]);
      expect(result.userStory).toBeNull();
    });
  });

  describe("acceptanceCriteria extraction", () => {
    it("extracts bullet items from Acceptance Criteria heading", () => {
      const body = [
        "## Acceptance Criteria",
        "- Login form validates email",
        "- Shows error on invalid credentials",
        "- Redirects to dashboard on success",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.acceptanceCriteria).toEqual([
        "Login form validates email",
        "Shows error on invalid credentials",
        "Redirects to dashboard on success",
      ]);
    });

    it("extracts from 達成要件 heading", () => {
      const body = [
        "## 達成要件",
        "- テストが通ること",
        "- 型チェックが通ること",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.acceptanceCriteria).toEqual([
        "テストが通ること",
        "型チェックが通ること",
      ]);
    });

    it("extracts from Done When heading", () => {
      const body = [
        "## Done When",
        "- [ ] Tests pass",
        "- [x] Code reviewed",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.acceptanceCriteria).toEqual([
        "Tests pass",
        "Code reviewed",
      ]);
    });

    it("returns empty array when no acceptance criteria", () => {
      const body = "## Purpose\nNothing here\n";
      const result = parseIntentContext([body]);
      expect(result.acceptanceCriteria).toEqual([]);
    });
  });

  describe("nonGoals extraction", () => {
    it("extracts from Non-Goals heading", () => {
      const body = [
        "## Non-Goals",
        "- Mobile support",
        "- Offline mode",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.nonGoals).toEqual(["Mobile support", "Offline mode"]);
    });

    it("extracts from 非目標 heading", () => {
      const body = ["## 非目標", "- パフォーマンス最適化", ""].join("\n");
      const result = parseIntentContext([body]);
      expect(result.nonGoals).toEqual(["パフォーマンス最適化"]);
    });
  });

  describe("targetUsers extraction", () => {
    it("extracts from Target Users heading", () => {
      const body = [
        "## Target Users",
        "- Admin users",
        "- Power users",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.targetUsers).toEqual(["Admin users", "Power users"]);
    });

    it("extracts from 想定ユーザー heading", () => {
      const body = ["## 想定ユーザー", "- 管理者", "- 一般ユーザー", ""].join(
        "\n",
      );
      const result = parseIntentContext([body]);
      expect(result.targetUsers).toEqual(["管理者", "一般ユーザー"]);
    });
  });

  describe("notesForQa extraction", () => {
    it("extracts from QA Notes heading", () => {
      const body = [
        "## QA Notes",
        "- Check with slow network",
        "- Test on Safari",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.notesForQa).toEqual([
        "Check with slow network",
        "Test on Safari",
      ]);
    });

    it("extracts from テスト観点 heading", () => {
      const body = ["## テスト観点", "- エラーハンドリング", ""].join("\n");
      const result = parseIntentContext([body]);
      expect(result.notesForQa).toEqual(["エラーハンドリング"]);
    });

    it("extracts from 確認観点 heading", () => {
      const body = ["## 確認観点", "- データ整合性", ""].join("\n");
      const result = parseIntentContext([body]);
      expect(result.notesForQa).toEqual(["データ整合性"]);
    });
  });

  describe("extractionStatus", () => {
    it("returns 'empty' when no sections found", () => {
      const result = parseIntentContext([""]);
      expect(result.extractionStatus).toBe("empty");
    });

    it("returns 'empty' for whitespace-only body", () => {
      const result = parseIntentContext(["   \n\n  "]);
      expect(result.extractionStatus).toBe("empty");
    });

    it("returns 'parsed' when at least one field is populated", () => {
      const body = "## Purpose\nAdd feature\n";
      const result = parseIntentContext([body]);
      expect(result.extractionStatus).toBe("parsed");
    });

    it("returns 'parsed' with full context", () => {
      const body = [
        "## Purpose",
        "New feature",
        "",
        "## User Story",
        "As a user I want X",
        "",
        "## Acceptance Criteria",
        "- Criterion A",
        "",
        "## Non-Goals",
        "- Not B",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.extractionStatus).toBe("parsed");
    });
  });

  describe("multiple sources", () => {
    it("merges context from PR body and linked issue body", () => {
      const prBody = [
        "## Purpose",
        "Add login feature",
        "",
        "## Acceptance Criteria",
        "- Login works",
        "",
      ].join("\n");

      const issueBody = [
        "## QA Notes",
        "- Test on mobile",
        "",
        "## Non-Goals",
        "- Password reset",
        "",
      ].join("\n");

      const result = parseIntentContext([prBody, issueBody]);
      expect(result.changePurpose).toBe("feature");
      expect(result.acceptanceCriteria).toEqual(["Login works"]);
      expect(result.notesForQa).toEqual(["Test on mobile"]);
      expect(result.nonGoals).toEqual(["Password reset"]);
    });

    it("PR body takes precedence for scalar fields", () => {
      const prBody = "## Purpose\nAdd feature\n";
      const issueBody = "## Purpose\nFix bug\n";
      const result = parseIntentContext([prBody, issueBody]);
      expect(result.changePurpose).toBe("feature");
    });

    it("array fields are merged from all sources", () => {
      const prBody = ["## Acceptance Criteria", "- Criterion A", ""].join("\n");
      const issueBody = ["## Acceptance Criteria", "- Criterion B", ""].join(
        "\n",
      );
      const result = parseIntentContext([prBody, issueBody]);
      expect(result.acceptanceCriteria).toEqual(["Criterion A", "Criterion B"]);
    });

    it("handles empty sources gracefully", () => {
      const result = parseIntentContext([]);
      expect(result.extractionStatus).toBe("empty");
      expect(result.changePurpose).toBeNull();
    });
  });

  describe("heading format variations", () => {
    it("matches h2 headings (##)", () => {
      const body = "## Purpose\nFeature\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("feature");
    });

    it("matches h3 headings (###)", () => {
      const body = "### Purpose\nFeature\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("feature");
    });

    it("is case-insensitive for headings", () => {
      const body = "## PURPOSE\nFeature\n";
      const result = parseIntentContext([body]);
      expect(result.changePurpose).toBe("feature");
    });

    it("handles numbered list items", () => {
      const body = [
        "## Acceptance Criteria",
        "1. First criterion",
        "2. Second criterion",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.acceptanceCriteria).toEqual([
        "First criterion",
        "Second criterion",
      ]);
    });

    it("strips checkbox markers from list items", () => {
      const body = [
        "## Acceptance Criteria",
        "- [ ] Unchecked item",
        "- [x] Checked item",
        "",
      ].join("\n");
      const result = parseIntentContext([body]);
      expect(result.acceptanceCriteria).toEqual([
        "Unchecked item",
        "Checked item",
      ]);
    });
  });

  describe("sourceRefs", () => {
    it("is populated with provided refs", () => {
      const body = "## Purpose\nFeature\n";
      const result = parseIntentContext([body], ["#10", "#42"]);
      expect(result.sourceRefs).toEqual(["#10", "#42"]);
    });

    it("defaults to empty array", () => {
      const body = "## Purpose\nFeature\n";
      const result = parseIntentContext([body]);
      expect(result.sourceRefs).toEqual([]);
    });
  });
});
