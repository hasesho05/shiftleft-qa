import type { PersistedTestMapping } from "../db/workspace-repository";
import { escapePipe } from "./markdown";

export type StabilityNote = {
  readonly testPath: string;
  readonly stability: "flaky" | "quarantined";
  readonly signals: readonly string[];
  readonly note: string;
};

export function collectStabilityNotesFromTestMapping(
  testMapping: PersistedTestMapping,
): readonly StabilityNote[] {
  const notes: StabilityNote[] = [];

  for (const asset of testMapping.testAssets) {
    const stability = asset.stability ?? "unknown";
    if (stability !== "flaky" && stability !== "quarantined") {
      continue;
    }

    const signals = asset.stabilitySignals ?? [];
    const userNotes = asset.stabilityNotes ?? [];
    const note =
      userNotes.length > 0
        ? userNotes.join("; ")
        : stability === "quarantined"
          ? "このテストは現在 quarantine 扱いです"
          : "このテストは不安定な挙動が報告されています";

    notes.push({
      testPath: asset.path,
      stability,
      signals,
      note,
    });
  }

  return notes;
}

export function renderStabilityNotesMarkdown(
  notes: readonly StabilityNote[],
): readonly string[] {
  if (notes.length === 0) {
    return [];
  }

  const lines: string[] = [];

  for (const note of notes) {
    lines.push(`- \`${escapePipe(note.testPath)}\``);
    lines.push(`  - ${escapePipe(note.note)}`);
    if (note.signals.length > 0) {
      lines.push(`  - 検出シグナル: ${escapePipe(note.signals.join(", "))}`);
    }
    const handling =
      note.stability === "quarantined"
        ? "現在無効化されているため、このテストの結果に依存しないこと"
        : "正常系の成立確認には使えるが、不安定な条件下では手動確認を優先する";
    lines.push(`  - 扱い: ${handling}`);
  }

  return lines;
}
