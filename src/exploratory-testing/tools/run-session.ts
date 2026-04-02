import {
  type PersistedObservation,
  type PersistedSession,
  findSessionChartersById,
  listObservations,
  saveObservation,
  saveSession,
  updateSessionStatus,
} from "../db/workspace-repository";
import type { ResolvedPluginConfig } from "../models/config";
import type { ObservationOutcome } from "../models/session";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

export type StartSessionInput = {
  readonly sessionChartersId: number;
  readonly charterIndex: number;
  readonly config: ResolvedPluginConfig;
};

export type StartSessionResult = {
  readonly session: PersistedSession;
};

export async function startSession(
  input: StartSessionInput,
): Promise<StartSessionResult> {
  const { sessionChartersId, charterIndex, config } = input;
  const databasePath = config.paths.database;

  // Create or retrieve existing session
  const session = saveSession(databasePath, {
    sessionChartersId,
    charterIndex,
    charterTitle: getCharterTitle(
      databasePath,
      sessionChartersId,
      charterIndex,
    ),
  });

  // Transition to in_progress (handles planned → in_progress and interrupted → in_progress)
  // Explicitly clear interrupt fields on resume
  const started = updateSessionStatus(databasePath, {
    sessionId: session.id,
    status: "in_progress",
    startedAt: session.startedAt ?? new Date().toISOString(),
    interruptedAt: null,
    interruptReason: null,
  });

  return { session: started };
}

export type AddObservationInput = {
  readonly sessionId: number;
  readonly targetedHeuristic: string;
  readonly action: string;
  readonly expected: string;
  readonly actual: string;
  readonly outcome: ObservationOutcome;
  readonly note: string;
  readonly evidencePath: string | null;
  readonly config: ResolvedPluginConfig;
};

export type AddObservationResult = {
  readonly observation: PersistedObservation;
};

export async function addSessionObservation(
  input: AddObservationInput,
): Promise<AddObservationResult> {
  const observation = saveObservation(input.config.paths.database, {
    sessionId: input.sessionId,
    targetedHeuristic: input.targetedHeuristic,
    action: input.action,
    expected: input.expected,
    actual: input.actual,
    outcome: input.outcome,
    note: input.note,
    evidencePath: input.evidencePath,
  });

  return { observation };
}

export type InterruptSessionInput = {
  readonly sessionId: number;
  readonly reason: string;
  readonly config: ResolvedPluginConfig;
};

export type InterruptSessionResult = {
  readonly session: PersistedSession;
  readonly handover: StepHandoverWriteResult;
};

export async function interruptSession(
  input: InterruptSessionInput,
): Promise<InterruptSessionResult> {
  const databasePath = input.config.paths.database;

  const session = updateSessionStatus(databasePath, {
    sessionId: input.sessionId,
    status: "interrupted",
    interruptedAt: new Date().toISOString(),
    interruptReason: input.reason,
  });

  const observations = listObservations(databasePath, session.id);
  const body = buildSessionHandoverBody(session, observations, "interrupted");

  const handover = await writeStepHandoverFromConfig(input.config, {
    stepName: "run-session",
    status: "interrupted",
    summary: buildSessionHandoverSummary(session, observations, "interrupted"),
    body,
  });

  return { session, handover };
}

export type CompleteSessionInput = {
  readonly sessionId: number;
  readonly config: ResolvedPluginConfig;
};

export type CompleteSessionResult = {
  readonly session: PersistedSession;
  readonly handover: StepHandoverWriteResult;
};

export async function completeSession(
  input: CompleteSessionInput,
): Promise<CompleteSessionResult> {
  const databasePath = input.config.paths.database;

  const session = updateSessionStatus(databasePath, {
    sessionId: input.sessionId,
    status: "completed",
    completedAt: new Date().toISOString(),
  });

  const observations = listObservations(databasePath, session.id);
  const body = buildSessionHandoverBody(session, observations, "completed");

  // run-session step stays in_progress because other sessions may still run
  const handover = await writeStepHandoverFromConfig(input.config, {
    stepName: "run-session",
    status: "in_progress",
    summary: buildSessionHandoverSummary(session, observations, "completed"),
    body,
  });

  return { session, handover };
}

function getCharterTitle(
  databasePath: string,
  sessionChartersId: number,
  charterIndex: number,
): string {
  const sessionCharters = findSessionChartersById(
    databasePath,
    sessionChartersId,
  );

  if (!sessionCharters) {
    throw new Error(`Session charters not found: id=${sessionChartersId}`);
  }

  const charter = sessionCharters.charters[charterIndex];

  if (!charter) {
    throw new Error(
      `Charter index ${charterIndex} out of range (${sessionCharters.charters.length} charters available)`,
    );
  }

  return charter.title;
}

function buildSessionHandoverSummary(
  session: PersistedSession,
  observations: readonly PersistedObservation[],
  finalStatus: "completed" | "interrupted",
): string {
  const outcomeCounts = countOutcomes(observations);
  const parts = [
    `Session "${escapePipe(session.charterTitle)}" ${finalStatus}`,
    `${observations.length} observation(s)`,
  ];

  if (outcomeCounts.fail > 0) {
    parts.push(`${outcomeCounts.fail} fail(s)`);
  }
  if (outcomeCounts.suspicious > 0) {
    parts.push(`${outcomeCounts.suspicious} suspicious`);
  }

  if (finalStatus === "interrupted" && session.interruptReason) {
    parts.push(`reason: ${session.interruptReason}`);
  }

  return parts.join("; ");
}

function buildSessionHandoverBody(
  session: PersistedSession,
  observations: readonly PersistedObservation[],
  finalStatus: "completed" | "interrupted",
): string {
  const lines = [
    `# Session: ${session.charterTitle}`,
    "",
    `**Status**: ${finalStatus}`,
    `**Charter index**: ${session.charterIndex}`,
    `**Session ID**: ${session.id}`,
    "",
  ];

  if (session.startedAt) {
    lines.push(`**Started at**: ${session.startedAt}`);
  }
  if (finalStatus === "interrupted" && session.interruptedAt) {
    lines.push(`**Interrupted at**: ${session.interruptedAt}`);
    if (session.interruptReason) {
      lines.push(`**Reason**: ${session.interruptReason}`);
    }
  }
  if (finalStatus === "completed" && session.completedAt) {
    lines.push(`**Completed at**: ${session.completedAt}`);
  }
  lines.push("");

  // Observations table
  if (observations.length > 0) {
    lines.push(
      "## Observations",
      "",
      "| # | Heuristic | Action | Expected | Actual | Outcome | Note | Evidence |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    );

    for (const obs of observations) {
      const evidence = obs.evidencePath ? escapePipe(obs.evidencePath) : "-";
      lines.push(
        `| ${obs.observationOrder} | ${escapePipe(obs.targetedHeuristic)} | ${escapePipe(obs.action)} | ${escapePipe(obs.expected)} | ${escapePipe(obs.actual)} | ${obs.outcome} | ${escapePipe(obs.note)} | ${evidence} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("## Observations", "", "No observations recorded.", "");
  }

  // Summary
  const outcomeCounts = countOutcomes(observations);
  lines.push(
    "## Outcome Summary",
    "",
    `- **pass**: ${outcomeCounts.pass}`,
    `- **fail**: ${outcomeCounts.fail}`,
    `- **unclear**: ${outcomeCounts.unclear}`,
    `- **suspicious**: ${outcomeCounts.suspicious}`,
    "",
  );

  if (finalStatus === "interrupted") {
    lines.push(
      "## Next step",
      "",
      "- Resume this session or start a new one",
      "",
    );
  } else {
    lines.push("## Next step", "", "- triage-findings", "");
  }

  return lines.join("\n");
}

function countOutcomes(observations: readonly PersistedObservation[]): {
  pass: number;
  fail: number;
  unclear: number;
  suspicious: number;
} {
  let pass = 0;
  let fail = 0;
  let unclear = 0;
  let suspicious = 0;

  for (const obs of observations) {
    switch (obs.outcome) {
      case "pass":
        pass++;
        break;
      case "fail":
        fail++;
        break;
      case "unclear":
        unclear++;
        break;
      case "suspicious":
        suspicious++;
        break;
    }
  }

  return { pass, fail, unclear, suspicious };
}

function escapePipe(text: string): string {
  return text.replace(/\|/g, "\\|");
}
