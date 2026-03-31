import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";

import { WORKFLOW_SKILLS, getWorkflowSkillOrThrow } from "../config/workflow";
import {
  type ProgressStatus,
  type StepProgressSnapshot,
  progressStatusSchema,
} from "../models/progress";
import { WORKSPACE_SCHEMA_SQL } from "./schema";

export type WorkspaceStateRecord = {
  readonly configPath: string;
  readonly repositoryRoot: string;
  readonly databasePath: string;
  readonly progressDirectory: string;
  readonly progressSummaryPath: string;
  readonly artifactsDirectory: string;
  readonly scmProvider: string;
  readonly defaultLanguage: string;
};

export type PersistedStepHandoverRecord = {
  readonly stepName: string;
  readonly status: ProgressStatus;
  readonly summary: string;
  readonly nextStep: string | null;
  readonly progressPath: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly frontmatterJson: string;
  readonly bodyMarkdown: string;
};

export type DatabasePragmas = {
  readonly journalMode: string;
  readonly foreignKeys: number;
};

type DatabasePragmaRow = {
  readonly journal_mode: string;
};

type ForeignKeyPragmaRow = {
  readonly foreign_keys: number;
};

type StepProgressRow = {
  readonly step_name: string;
  readonly step_order: number;
  readonly skill_name: string;
  readonly title: string;
  readonly status: string;
  readonly summary: string;
  readonly next_step: string | null;
  readonly progress_path: string | null;
  readonly updated_at: string | null;
  readonly completed_at: string | null;
};

export function initializeWorkspaceDatabase(databasePath: string): void {
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = openDatabase(databasePath);

  try {
    database.exec(WORKSPACE_SCHEMA_SQL);
    seedWorkflowSteps(database);
  } finally {
    database.close();
  }
}

export function getDatabasePragmas(databasePath: string): DatabasePragmas {
  const database = openDatabase(databasePath);

  try {
    const journalMode =
      database.query("PRAGMA journal_mode").get<DatabasePragmaRow>()
        ?.journal_mode ?? "";
    const foreignKeys =
      database.query("PRAGMA foreign_keys").get<ForeignKeyPragmaRow>()
        ?.foreign_keys ?? 0;

    return {
      journalMode,
      foreignKeys,
    };
  } finally {
    database.close();
  }
}

export function saveWorkspaceState(
  databasePath: string,
  record: WorkspaceStateRecord,
): void {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    database
      .query(
        `
        INSERT INTO workspace_state (
          id,
          config_path,
          repository_root,
          database_path,
          progress_directory,
          progress_summary_path,
          artifacts_directory,
          scm_provider,
          default_language,
          initialized_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(id) DO UPDATE SET
          config_path = excluded.config_path,
          repository_root = excluded.repository_root,
          database_path = excluded.database_path,
          progress_directory = excluded.progress_directory,
          progress_summary_path = excluded.progress_summary_path,
          artifacts_directory = excluded.artifacts_directory,
          scm_provider = excluded.scm_provider,
          default_language = excluded.default_language,
          updated_at = excluded.updated_at
        `,
      )
      .run(
        1,
        record.configPath,
        record.repositoryRoot,
        record.databasePath,
        record.progressDirectory,
        record.progressSummaryPath,
        record.artifactsDirectory,
        record.scmProvider,
        record.defaultLanguage,
        timestamp,
        timestamp,
      );
  } finally {
    database.close();
  }
}

export function listStepProgressSnapshots(
  databasePath: string,
): readonly StepProgressSnapshot[] {
  const database = openDatabase(databasePath);

  try {
    const rows = database
      .query(
        `
        SELECT
          workflow_steps.step_name AS step_name,
          workflow_steps.step_order AS step_order,
          workflow_steps.skill_name AS skill_name,
          workflow_steps.title AS title,
          COALESCE(step_progress.status, 'pending') AS status,
          COALESCE(step_progress.summary, '') AS summary,
          step_progress.next_step AS next_step,
          step_progress.progress_path AS progress_path,
          step_progress.updated_at AS updated_at,
          step_progress.completed_at AS completed_at
        FROM workflow_steps
        LEFT JOIN step_progress
          ON workflow_steps.step_name = step_progress.step_name
        ORDER BY workflow_steps.step_order
        `,
      )
      .all<StepProgressRow>();

    return rows.map(mapStepProgressRow);
  } finally {
    database.close();
  }
}

export function upsertStepHandoverRecord(
  databasePath: string,
  record: PersistedStepHandoverRecord,
): StepProgressSnapshot {
  getWorkflowSkillOrThrow(record.stepName);

  if (record.nextStep) {
    getWorkflowSkillOrThrow(record.nextStep);
  }

  const database = openDatabase(databasePath);

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO step_progress (
            step_name,
            status,
            summary,
            next_step,
            progress_path,
            updated_at,
            completed_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          ON CONFLICT(step_name) DO UPDATE SET
            status = excluded.status,
            summary = excluded.summary,
            next_step = excluded.next_step,
            progress_path = excluded.progress_path,
            updated_at = excluded.updated_at,
            completed_at = excluded.completed_at
          `,
        )
        .run(
          record.stepName,
          record.status,
          record.summary,
          record.nextStep,
          record.progressPath,
          record.updatedAt,
          record.completedAt,
        );

      database
        .query(
          `
          INSERT INTO handover_documents (
            step_name,
            frontmatter_json,
            body_markdown,
            updated_at
          ) VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT(step_name) DO UPDATE SET
            frontmatter_json = excluded.frontmatter_json,
            body_markdown = excluded.body_markdown,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          record.stepName,
          record.frontmatterJson,
          record.bodyMarkdown,
          record.updatedAt,
        );
    });

    persist();

    const snapshot = database
      .query(
        `
        SELECT
          workflow_steps.step_name AS step_name,
          workflow_steps.step_order AS step_order,
          workflow_steps.skill_name AS skill_name,
          workflow_steps.title AS title,
          COALESCE(step_progress.status, 'pending') AS status,
          COALESCE(step_progress.summary, '') AS summary,
          step_progress.next_step AS next_step,
          step_progress.progress_path AS progress_path,
          step_progress.updated_at AS updated_at,
          step_progress.completed_at AS completed_at
        FROM workflow_steps
        LEFT JOIN step_progress
          ON workflow_steps.step_name = step_progress.step_name
        WHERE workflow_steps.step_name = ?1
        `,
      )
      .get<StepProgressRow>(record.stepName);

    if (!snapshot) {
      throw new Error(`Failed to persist handover for step ${record.stepName}`);
    }

    return mapStepProgressRow(snapshot);
  } finally {
    database.close();
  }
}

function openDatabase(databasePath: string): Database {
  const database = new Database(databasePath, {
    create: true,
  });

  database.exec("PRAGMA journal_mode=WAL;");
  database.exec("PRAGMA foreign_keys=ON;");

  return database;
}

function seedWorkflowSteps(database: Database): void {
  const seed = database.transaction(() => {
    const statement = database.query(
      `
      INSERT INTO workflow_steps (
        step_name,
        step_order,
        skill_name,
        title,
        description
      ) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(step_name) DO UPDATE SET
        step_order = excluded.step_order,
        skill_name = excluded.skill_name,
        title = excluded.title,
        description = excluded.description
      `,
    );

    for (const [index, skill] of WORKFLOW_SKILLS.entries()) {
      statement.run(
        skill.name,
        index + 1,
        skill.name,
        skill.title,
        skill.description,
      );
    }
  });

  seed();
}

function mapStepProgressRow(row: StepProgressRow): StepProgressSnapshot {
  return {
    stepName: row.step_name,
    stepOrder: row.step_order,
    skillName: row.skill_name,
    title: row.title,
    status: progressStatusSchema.parse(row.status),
    summary: row.summary,
    nextStep: row.next_step,
    progressPath: row.progress_path,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}
