import type {
  ChangePurpose,
  ExtractionStatus,
  IntentContext,
} from "../models/intent-context";

type SectionKey =
  | "purpose"
  | "userStory"
  | "acceptanceCriteria"
  | "nonGoals"
  | "targetUsers"
  | "notesForQa";

const SECTION_HEADING_MAP: ReadonlyMap<string, SectionKey> = new Map([
  ["purpose", "purpose"],
  ["目的", "purpose"],
  ["user story", "userStory"],
  ["ユーザーストーリー", "userStory"],
  ["acceptance criteria", "acceptanceCriteria"],
  ["達成要件", "acceptanceCriteria"],
  ["done when", "acceptanceCriteria"],
  ["non-goals", "nonGoals"],
  ["non goals", "nonGoals"],
  ["非目標", "nonGoals"],
  ["target users", "targetUsers"],
  ["想定ユーザー", "targetUsers"],
  ["qa notes", "notesForQa"],
  ["テスト観点", "notesForQa"],
  ["確認観点", "notesForQa"],
]);

const HEADING_REGEX = /^#{2,3}\s+(.+)$/;
const BULLET_REGEX = /^[-*]\s+(?:\[[ x]\]\s+)?(.+)$/;
const NUMBERED_REGEX = /^\d+\.\s+(.+)$/;

type PurposeRule = {
  readonly pattern: RegExp;
  readonly purpose: ChangePurpose;
};

const PURPOSE_RULES: readonly PurposeRule[] = [
  { pattern: /\bfeature\b/, purpose: "feature" },
  { pattern: /\badd\b/, purpose: "feature" },
  { pattern: /\bimplement\b/, purpose: "feature" },
  { pattern: /新機能/, purpose: "feature" },
  { pattern: /追加/, purpose: "feature" },
  { pattern: /\bbug\b/, purpose: "bugfix" },
  { pattern: /\bfix\b/, purpose: "bugfix" },
  { pattern: /修正/, purpose: "bugfix" },
  { pattern: /バグ/, purpose: "bugfix" },
  { pattern: /\brefactor\b/, purpose: "refactor" },
  { pattern: /リファクタ/, purpose: "refactor" },
  { pattern: /\bdoc(umentation)?\b/, purpose: "docs" },
  { pattern: /ドキュメント/, purpose: "docs" },
  { pattern: /\bconfig(uration)?\b/, purpose: "config" },
  { pattern: /設定/, purpose: "config" },
];

export function parseIntentContext(
  sources: readonly string[],
  sourceRefs: readonly string[] = [],
): IntentContext {
  let changePurpose: ChangePurpose | null = null;
  let userStory: string | null = null;
  const acceptanceCriteria: string[] = [];
  const nonGoals: string[] = [];
  const targetUsers: string[] = [];
  const notesForQa: string[] = [];

  for (const source of sources) {
    const parsed = parseSingleSource(source);

    if (changePurpose === null && parsed.changePurpose !== null) {
      changePurpose = parsed.changePurpose;
    }
    if (userStory === null && parsed.userStory !== null) {
      userStory = parsed.userStory;
    }
    acceptanceCriteria.push(...parsed.acceptanceCriteria);
    nonGoals.push(...parsed.nonGoals);
    targetUsers.push(...parsed.targetUsers);
    notesForQa.push(...parsed.notesForQa);
  }

  const extractionStatus = deriveExtractionStatus({
    changePurpose,
    userStory,
    acceptanceCriteria,
    nonGoals,
    targetUsers,
    notesForQa,
  });

  return {
    changePurpose,
    userStory,
    acceptanceCriteria,
    nonGoals,
    targetUsers,
    notesForQa,
    sourceRefs: [...sourceRefs],
    extractionStatus,
  };
}

type ParsedSource = {
  readonly changePurpose: ChangePurpose | null;
  readonly userStory: string | null;
  readonly acceptanceCriteria: readonly string[];
  readonly nonGoals: readonly string[];
  readonly targetUsers: readonly string[];
  readonly notesForQa: readonly string[];
};

function parseSingleSource(source: string): ParsedSource {
  const lines = source.split("\n");
  const sections = extractSections(lines);

  const purposeText = sections.get("purpose");
  const changePurpose = purposeText ? inferChangePurpose(purposeText) : null;

  const userStoryText = sections.get("userStory");
  const userStory = userStoryText ? userStoryText.join("\n").trim() : null;

  return {
    changePurpose,
    userStory: userStory && userStory.length > 0 ? userStory : null,
    acceptanceCriteria: extractListItems(sections.get("acceptanceCriteria")),
    nonGoals: extractListItems(sections.get("nonGoals")),
    targetUsers: extractListItems(sections.get("targetUsers")),
    notesForQa: extractListItems(sections.get("notesForQa")),
  };
}

function extractSections(
  lines: readonly string[],
): ReadonlyMap<SectionKey, readonly string[]> {
  const sections = new Map<SectionKey, string[]>();
  let currentKey: SectionKey | null = null;

  for (const line of lines) {
    const headingMatch = HEADING_REGEX.exec(line);
    if (headingMatch) {
      const headingText = headingMatch[1].trim().toLowerCase();
      const key = SECTION_HEADING_MAP.get(headingText);
      currentKey = key ?? null;
      continue;
    }

    if (currentKey !== null) {
      const existing = sections.get(currentKey);
      if (existing) {
        existing.push(line);
      } else {
        sections.set(currentKey, [line]);
      }
    }
  }

  return sections;
}

function extractListItems(
  lines: readonly string[] | undefined,
): readonly string[] {
  if (!lines) return [];

  const items: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = BULLET_REGEX.exec(trimmed);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
      continue;
    }
    const numberedMatch = NUMBERED_REGEX.exec(trimmed);
    if (numberedMatch) {
      items.push(numberedMatch[1].trim());
    }
  }
  return items;
}

function inferChangePurpose(lines: readonly string[]): ChangePurpose | null {
  const text = lines.join(" ").toLowerCase();

  for (const rule of PURPOSE_RULES) {
    if (rule.pattern.test(text)) {
      return rule.purpose;
    }
  }

  return "other";
}

function deriveExtractionStatus(fields: {
  readonly changePurpose: ChangePurpose | null;
  readonly userStory: string | null;
  readonly acceptanceCriteria: readonly string[];
  readonly nonGoals: readonly string[];
  readonly targetUsers: readonly string[];
  readonly notesForQa: readonly string[];
}): ExtractionStatus {
  const hasAny =
    fields.changePurpose !== null ||
    fields.userStory !== null ||
    fields.acceptanceCriteria.length > 0 ||
    fields.nonGoals.length > 0 ||
    fields.targetUsers.length > 0 ||
    fields.notesForQa.length > 0;

  return hasAny ? "parsed" : "empty";
}
