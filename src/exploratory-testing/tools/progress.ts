import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import matter from "gray-matter";

import {
  getNextWorkflowSkillName,
  getWorkflowSkillOrThrow,
  getWorkflowStepNumber,
} from "../config/workflow";
import {
  type PersistedStepHandoverRecord,
  initializeWorkspaceDatabase,
  listStepProgressSnapshots,
  saveWorkspaceState,
  upsertStepHandoverRecord,
} from "../db/workspace-repository";
import type { ResolvedPluginConfig } from "../models/config";
import {
  type ProgressSummaryDocument,
  type StepHandoverDocument,
  type StepProgressSnapshot,
  type WriteStepHandoverInput,
  progressSummaryFrontmatterSchema,
  stepHandoverFrontmatterSchema,
} from "../models/progress";
import { readPluginConfig } from "./config";

export type StepHandoverWriteResult = {
  readonly filePath: string;
  readonly snapshot: StepProgressSnapshot;
};

export type ProgressSummaryWriteResult = {
  readonly filePath: string;
  readonly currentStep: string | null;
  readonly snapshots: readonly StepProgressSnapshot[];
};

export async function writeStepHandover(
  input: WriteStepHandoverInput,
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
): Promise<StepHandoverWriteResult> {
  const config = await readPluginConfig(configPath, manifestPath);

  return writeStepHandoverFromConfig(config, input);
}

export async function writeStepHandoverFromConfig(
  config: ResolvedPluginConfig,
  input: WriteStepHandoverInput,
): Promise<StepHandoverWriteResult> {
  const skill = getWorkflowSkillOrThrow(input.stepName);
  const stepNumber = getWorkflowStepNumber(input.stepName);
  const nextStep = input.nextStep ?? getNextWorkflowSkillName(input.stepName);
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const completedAt =
    input.completedAt ?? (input.status === "completed" ? updatedAt : null);
  const filePath = resolve(
    config.paths.progressDirectory,
    createStepProgressFilename(input.stepName),
  );
  initializeWorkspaceDatabase(config.paths.database);
  const fileContents = matter.stringify(
    buildStepHandoverBody(skill.title, input.summary, nextStep, input.body),
    {
      step: stepNumber,
      step_name: input.stepName,
      skill: skill.name,
      status: input.status,
      updated_at: updatedAt,
      completed_at: completedAt,
      next_step: nextStep,
    },
  );

  await mkdir(config.paths.progressDirectory, { recursive: true });
  await writeFile(filePath, fileContents, "utf8");

  saveWorkspaceState(config.paths.database, {
    configPath: relative(config.workspaceRoot, config.configPath),
    repositoryRoot: config.repositoryRoot,
    databasePath: config.relativePaths.database,
    progressDirectory: config.relativePaths.progressDirectory,
    progressSummaryPath: config.relativePaths.progressSummary,
    artifactsDirectory: config.relativePaths.artifactsDirectory,
    scmProvider: config.scmProvider,
    defaultLanguage: config.defaultLanguage,
  });

  const record: PersistedStepHandoverRecord = {
    stepName: input.stepName,
    status: input.status,
    summary: input.summary,
    nextStep,
    progressPath: relative(config.workspaceRoot, filePath),
    updatedAt,
    completedAt,
    frontmatterJson: JSON.stringify(
      stepHandoverFrontmatterSchema.parse(matter(fileContents).data),
    ),
    bodyMarkdown: matter(fileContents).content,
  };

  const snapshot = upsertStepHandoverRecord(config.paths.database, record);
  await writeProgressSummaryFromConfig(config);

  return {
    filePath,
    snapshot,
  };
}

export async function writeProgressSummary(
  configPath = "config.json",
  manifestPath = ".claude-plugin/plugin.json",
): Promise<ProgressSummaryWriteResult> {
  const config = await readPluginConfig(configPath, manifestPath);

  return writeProgressSummaryFromConfig(config);
}

export async function writeProgressSummaryFromConfig(
  config: ResolvedPluginConfig,
): Promise<ProgressSummaryWriteResult> {
  initializeWorkspaceDatabase(config.paths.database);
  const snapshots = listStepProgressSnapshots(config.paths.database);
  const currentStep = detectCurrentStep(snapshots);
  const completedSteps = snapshots.filter(
    (snapshot) =>
      snapshot.status === "completed" || snapshot.status === "skipped",
  ).length;
  const lastUpdated =
    snapshots.find((snapshot) => snapshot.updatedAt)?.updatedAt ??
    new Date().toISOString();
  const document = matter.stringify(
    buildProgressSummaryBody(snapshots),
    progressSummaryFrontmatterSchema.parse({
      last_updated: lastUpdated,
      current_step: currentStep,
      completed_steps: completedSteps,
      total_steps: snapshots.length,
    }),
  );

  await mkdir(config.paths.progressDirectory, { recursive: true });
  await writeFile(config.paths.progressSummary, document, "utf8");

  return {
    filePath: config.paths.progressSummary,
    currentStep,
    snapshots,
  };
}

export async function readStepHandoverDocument(
  filePath: string,
): Promise<StepHandoverDocument> {
  const contents = await readFile(resolve(filePath), "utf8");
  const parsed = matter(contents);

  return {
    frontmatter: stepHandoverFrontmatterSchema.parse(parsed.data),
    body: parsed.content,
  };
}

export async function readProgressSummaryDocument(
  filePath: string,
): Promise<ProgressSummaryDocument> {
  const contents = await readFile(resolve(filePath), "utf8");
  const parsed = matter(contents);

  return {
    frontmatter: progressSummaryFrontmatterSchema.parse(parsed.data),
    body: parsed.content,
  };
}

export function createStepProgressFilename(stepName: string): string {
  const stepNumber = getWorkflowStepNumber(stepName);

  return `${String(stepNumber).padStart(2, "0")}-${stepName}.md`;
}

function buildStepHandoverBody(
  title: string,
  summary: string,
  nextStep: string | null,
  providedBody: string | null | undefined,
): string {
  if (providedBody) {
    return providedBody.endsWith("\n") ? providedBody : `${providedBody}\n`;
  }

  const lines = [`# ${title}`, "", "## Summary", "", summary, ""];

  if (nextStep) {
    lines.push("## Next step", "", `- ${nextStep}`, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function buildProgressSummaryBody(
  snapshots: readonly StepProgressSnapshot[],
): string {
  const lines = [
    "# Workflow progress summary",
    "",
    "| # | Step | Skill | Status | Updated |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const snapshot of snapshots) {
    lines.push(
      `| ${snapshot.stepOrder} | ${snapshot.title} | ${snapshot.skillName} | ${snapshot.status} | ${snapshot.updatedAt ?? ""} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function detectCurrentStep(
  snapshots: readonly StepProgressSnapshot[],
): string | null {
  const activeStep = snapshots.find((snapshot) =>
    ["in_progress", "interrupted", "failed"].includes(snapshot.status),
  );

  if (activeStep) {
    return activeStep.stepName;
  }

  const pendingStep = snapshots.find(
    (snapshot) => snapshot.status === "pending",
  );
  return pendingStep?.stepName ?? null;
}
