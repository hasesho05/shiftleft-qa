import type { IntentContext } from "../models/intent-context";
import { escapePipe } from "./markdown";

/**
 * Render the common intent-context fields as a Markdown section.
 * Used by both the handoff issue and the exploration-brief export so that
 * the two outputs stay structurally consistent.
 *
 * @param heading — The Markdown heading to use (e.g. "## Intent Context")
 * @param intentContext — The intent context to render, or null/undefined to skip
 * @returns Lines of Markdown (without a trailing separator)
 */
export function renderIntentContextLines(
  heading: string,
  intentContext: IntentContext | null | undefined,
): readonly string[] {
  if (!intentContext || intentContext.extractionStatus === "empty") {
    return [];
  }

  const lines: string[] = [heading, ""];

  if (intentContext.changePurpose) {
    lines.push(`- **Purpose**: ${intentContext.changePurpose}`);
  }
  if (intentContext.userStory) {
    lines.push(`- **User story**: ${escapePipe(intentContext.userStory)}`);
  }
  if (intentContext.targetUsers.length > 0) {
    lines.push(
      `- **Target users**: ${intentContext.targetUsers.map(escapePipe).join(", ")}`,
    );
  }
  if (intentContext.acceptanceCriteria.length > 0) {
    lines.push("- **Acceptance criteria**:");
    for (const criterion of intentContext.acceptanceCriteria) {
      lines.push(`  - ${escapePipe(criterion)}`);
    }
  }
  if (intentContext.nonGoals.length > 0) {
    lines.push("- **Non-goals**:");
    for (const goal of intentContext.nonGoals) {
      lines.push(`  - ${escapePipe(goal)}`);
    }
  }
  if (intentContext.notesForQa.length > 0) {
    lines.push("- **QA notes**:");
    for (const note of intentContext.notesForQa) {
      lines.push(`  - ${escapePipe(note)}`);
    }
  }

  lines.push("");
  return lines;
}
