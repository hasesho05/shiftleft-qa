import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";
import { z } from "zod";

import { WORKFLOW_SKILLS, getWorkflowSkillOrThrow } from "../config/workflow";
import {
  type ChangeAnalysisResult,
  fileChangeAnalysisSchema,
  relatedCodeCandidateSchema,
  viewpointSeedSchema,
} from "../models/change-analysis";
import {
  type Finding,
  type FindingSeverity,
  type FindingType,
  type RecommendedTestLayer,
  findingSeveritySchema,
  findingTypeSchema,
  recommendedTestLayerSchema,
} from "../models/finding";
import {
  type PrMetadata,
  changedFileSchema,
  reviewCommentSchema,
} from "../models/pr-intake";
import {
  type ProgressStatus,
  type StepProgressSnapshot,
  progressStatusSchema,
} from "../models/progress";
import {
  type RiskAssessmentResult,
  explorationThemeSchema,
  frameworkSelectionSchema,
  riskScoreSchema,
} from "../models/risk-assessment";
import {
  type Observation,
  type SessionStatus,
  observationOutcomeSchema,
  sessionStatusSchema,
} from "../models/session";
import {
  type SessionCharter,
  type SessionCharterGenerationResult,
  sessionCharterSchema,
} from "../models/session-charter";
import {
  type TestMappingResult,
  coverageGapEntrySchema,
  testAssetSchema,
  testLayerSchema,
  testSummarySchema,
} from "../models/test-mapping";
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

// --- PR Intake repository ---

export type PersistedPrIntake = {
  readonly id: number;
  readonly provider: string;
  readonly repository: string;
  readonly prNumber: number;
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly linkedIssues: readonly string[];
  readonly changedFiles: PrMetadata["changedFiles"];
  readonly reviewComments: PrMetadata["reviewComments"];
  readonly fetchedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type PrIntakeRow = {
  readonly id: number;
  readonly provider: string;
  readonly repository: string;
  readonly pr_number: number;
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly base_branch: string;
  readonly head_branch: string;
  readonly head_sha: string;
  readonly linked_issues_json: string;
  readonly changed_files_json: string;
  readonly review_comments_json: string;
  readonly fetched_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export function savePrIntake(
  databasePath: string,
  metadata: PrMetadata,
): PersistedPrIntake {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO pr_intakes (
            provider, repository, pr_number, title, description,
            author, base_branch, head_branch, head_sha,
            linked_issues_json, changed_files_json, review_comments_json,
            fetched_at, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
          ON CONFLICT(provider, repository, pr_number, head_sha) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            author = excluded.author,
            base_branch = excluded.base_branch,
            head_branch = excluded.head_branch,
            linked_issues_json = excluded.linked_issues_json,
            changed_files_json = excluded.changed_files_json,
            review_comments_json = excluded.review_comments_json,
            fetched_at = excluded.fetched_at,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          metadata.provider,
          metadata.repository,
          metadata.prNumber,
          metadata.title,
          metadata.description,
          metadata.author,
          metadata.baseBranch,
          metadata.headBranch,
          metadata.headSha,
          JSON.stringify(metadata.linkedIssues),
          JSON.stringify(metadata.changedFiles),
          JSON.stringify(metadata.reviewComments),
          metadata.fetchedAt,
          timestamp,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM pr_intakes
          WHERE provider = ?1 AND repository = ?2 AND pr_number = ?3 AND head_sha = ?4
          `,
        )
        .get<PrIntakeRow>(
          metadata.provider,
          metadata.repository,
          metadata.prNumber,
          metadata.headSha,
        );
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist PR intake for ${metadata.provider}/${metadata.repository}#${metadata.prNumber}`,
      );
    }

    return mapPrIntakeRow(row);
  } finally {
    database.close();
  }
}

export function findPrIntake(
  databasePath: string,
  provider: string,
  repository: string,
  prNumber: number,
): PersistedPrIntake | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query(
        `
        SELECT * FROM pr_intakes
        WHERE provider = ?1 AND repository = ?2 AND pr_number = ?3
        ORDER BY updated_at DESC
        LIMIT 1
        `,
      )
      .get<PrIntakeRow>(provider, repository, prNumber);

    return row ? mapPrIntakeRow(row) : null;
  } finally {
    database.close();
  }
}

export function listPrIntakes(
  databasePath: string,
): readonly PersistedPrIntake[] {
  const database = openDatabase(databasePath);

  try {
    const rows = database
      .query("SELECT * FROM pr_intakes ORDER BY updated_at DESC")
      .all<PrIntakeRow>();

    return rows.map(mapPrIntakeRow);
  } finally {
    database.close();
  }
}

function mapPrIntakeRow(row: PrIntakeRow): PersistedPrIntake {
  return {
    id: row.id,
    provider: row.provider,
    repository: row.repository,
    prNumber: row.pr_number,
    title: row.title,
    description: row.description,
    author: row.author,
    baseBranch: row.base_branch,
    headBranch: row.head_branch,
    headSha: row.head_sha,
    linkedIssues: z.array(z.string()).parse(JSON.parse(row.linked_issues_json)),
    changedFiles: z
      .array(changedFileSchema)
      .parse(JSON.parse(row.changed_files_json)),
    reviewComments: z
      .array(reviewCommentSchema)
      .parse(JSON.parse(row.review_comments_json)),
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Change Analysis repository ---

export type PersistedChangeAnalysis = {
  readonly id: number;
  readonly prIntakeId: number;
  readonly fileAnalyses: ChangeAnalysisResult["fileAnalyses"];
  readonly relatedCodes: ChangeAnalysisResult["relatedCodes"];
  readonly viewpointSeeds: ChangeAnalysisResult["viewpointSeeds"];
  readonly summary: string;
  readonly analyzedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type ChangeAnalysisRow = {
  readonly id: number;
  readonly pr_intake_id: number;
  readonly file_analyses_json: string;
  readonly related_codes_json: string;
  readonly viewpoint_seeds_json: string;
  readonly summary: string;
  readonly analyzed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export function saveChangeAnalysis(
  databasePath: string,
  result: ChangeAnalysisResult,
): PersistedChangeAnalysis {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO change_analyses (
            pr_intake_id, file_analyses_json, related_codes_json,
            viewpoint_seeds_json, summary, analyzed_at,
            created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
          ON CONFLICT(pr_intake_id) DO UPDATE SET
            file_analyses_json = excluded.file_analyses_json,
            related_codes_json = excluded.related_codes_json,
            viewpoint_seeds_json = excluded.viewpoint_seeds_json,
            summary = excluded.summary,
            analyzed_at = excluded.analyzed_at,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          result.prIntakeId,
          JSON.stringify(result.fileAnalyses),
          JSON.stringify(result.relatedCodes),
          JSON.stringify(result.viewpointSeeds),
          result.summary,
          result.analyzedAt,
          timestamp,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM change_analyses
          WHERE pr_intake_id = ?1
          `,
        )
        .get<ChangeAnalysisRow>(result.prIntakeId);
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist change analysis for pr_intake_id=${result.prIntakeId}`,
      );
    }

    return mapChangeAnalysisRow(row);
  } finally {
    database.close();
  }
}

export function findChangeAnalysis(
  databasePath: string,
  prIntakeId: number,
): PersistedChangeAnalysis | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query(
        `
        SELECT * FROM change_analyses
        WHERE pr_intake_id = ?1
        `,
      )
      .get<ChangeAnalysisRow>(prIntakeId);

    return row ? mapChangeAnalysisRow(row) : null;
  } finally {
    database.close();
  }
}

function mapChangeAnalysisRow(row: ChangeAnalysisRow): PersistedChangeAnalysis {
  return {
    id: row.id,
    prIntakeId: row.pr_intake_id,
    fileAnalyses: z
      .array(fileChangeAnalysisSchema)
      .parse(JSON.parse(row.file_analyses_json)),
    relatedCodes: z
      .array(relatedCodeCandidateSchema)
      .parse(JSON.parse(row.related_codes_json)),
    viewpointSeeds: z
      .array(viewpointSeedSchema)
      .parse(JSON.parse(row.viewpoint_seeds_json)),
    summary: row.summary,
    analyzedAt: row.analyzed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Test Mapping repository ---

export type PersistedTestMapping = {
  readonly id: number;
  readonly prIntakeId: number;
  readonly changeAnalysisId: number;
  readonly testAssets: TestMappingResult["testAssets"];
  readonly testSummaries: TestMappingResult["testSummaries"];
  readonly coverageGapMap: TestMappingResult["coverageGapMap"];
  readonly missingLayers: TestMappingResult["missingLayers"];
  readonly mappedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type TestMappingRow = {
  readonly id: number;
  readonly pr_intake_id: number;
  readonly change_analysis_id: number;
  readonly test_assets_json: string;
  readonly test_summaries_json: string;
  readonly coverage_gap_map_json: string;
  readonly missing_layers_json: string;
  readonly mapped_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export function saveTestMapping(
  databasePath: string,
  result: TestMappingResult,
): PersistedTestMapping {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO test_mappings (
            change_analysis_id, pr_intake_id,
            test_assets_json, test_summaries_json,
            coverage_gap_map_json, missing_layers_json,
            mapped_at, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          ON CONFLICT(change_analysis_id) DO UPDATE SET
            pr_intake_id = excluded.pr_intake_id,
            test_assets_json = excluded.test_assets_json,
            test_summaries_json = excluded.test_summaries_json,
            coverage_gap_map_json = excluded.coverage_gap_map_json,
            missing_layers_json = excluded.missing_layers_json,
            mapped_at = excluded.mapped_at,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          result.changeAnalysisId,
          result.prIntakeId,
          JSON.stringify(result.testAssets),
          JSON.stringify(result.testSummaries),
          JSON.stringify(result.coverageGapMap),
          JSON.stringify(result.missingLayers),
          result.mappedAt,
          timestamp,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM test_mappings
          WHERE change_analysis_id = ?1
          `,
        )
        .get<TestMappingRow>(result.changeAnalysisId);
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist test mapping for change_analysis_id=${result.changeAnalysisId}`,
      );
    }

    return mapTestMappingRow(row);
  } finally {
    database.close();
  }
}

export function findTestMapping(
  databasePath: string,
  changeAnalysisId: number,
): PersistedTestMapping | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query(
        `
        SELECT * FROM test_mappings
        WHERE change_analysis_id = ?1
        `,
      )
      .get<TestMappingRow>(changeAnalysisId);

    return row ? mapTestMappingRow(row) : null;
  } finally {
    database.close();
  }
}

function mapTestMappingRow(row: TestMappingRow): PersistedTestMapping {
  return {
    id: row.id,
    prIntakeId: row.pr_intake_id,
    changeAnalysisId: row.change_analysis_id,
    testAssets: z
      .array(testAssetSchema)
      .parse(JSON.parse(row.test_assets_json)),
    testSummaries: z
      .array(testSummarySchema)
      .parse(JSON.parse(row.test_summaries_json)),
    coverageGapMap: z
      .array(coverageGapEntrySchema)
      .parse(JSON.parse(row.coverage_gap_map_json)),
    missingLayers: z
      .array(testLayerSchema)
      .parse(JSON.parse(row.missing_layers_json)),
    mappedAt: row.mapped_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Risk Assessment repository ---

export type PersistedRiskAssessment = {
  readonly id: number;
  readonly testMappingId: number;
  readonly riskScores: RiskAssessmentResult["riskScores"];
  readonly frameworkSelections: RiskAssessmentResult["frameworkSelections"];
  readonly explorationThemes: RiskAssessmentResult["explorationThemes"];
  readonly assessedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type RiskAssessmentRow = {
  readonly id: number;
  readonly test_mapping_id: number;
  readonly risk_scores_json: string;
  readonly framework_selections_json: string;
  readonly exploration_themes_json: string;
  readonly assessed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export function saveRiskAssessment(
  databasePath: string,
  result: RiskAssessmentResult,
): PersistedRiskAssessment {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO risk_assessments (
            test_mapping_id, risk_scores_json, framework_selections_json,
            exploration_themes_json, assessed_at,
            created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          ON CONFLICT(test_mapping_id) DO UPDATE SET
            risk_scores_json = excluded.risk_scores_json,
            framework_selections_json = excluded.framework_selections_json,
            exploration_themes_json = excluded.exploration_themes_json,
            assessed_at = excluded.assessed_at,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          result.testMappingId,
          JSON.stringify(result.riskScores),
          JSON.stringify(result.frameworkSelections),
          JSON.stringify(result.explorationThemes),
          result.assessedAt,
          timestamp,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM risk_assessments
          WHERE test_mapping_id = ?1
          `,
        )
        .get<RiskAssessmentRow>(result.testMappingId);
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist risk assessment for test_mapping_id=${result.testMappingId}`,
      );
    }

    return mapRiskAssessmentRow(row);
  } finally {
    database.close();
  }
}

export function findRiskAssessment(
  databasePath: string,
  testMappingId: number,
): PersistedRiskAssessment | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query(
        `
        SELECT * FROM risk_assessments
        WHERE test_mapping_id = ?1
        `,
      )
      .get<RiskAssessmentRow>(testMappingId);

    return row ? mapRiskAssessmentRow(row) : null;
  } finally {
    database.close();
  }
}

function mapRiskAssessmentRow(row: RiskAssessmentRow): PersistedRiskAssessment {
  return {
    id: row.id,
    testMappingId: row.test_mapping_id,
    riskScores: z
      .array(riskScoreSchema)
      .parse(JSON.parse(row.risk_scores_json)),
    frameworkSelections: z
      .array(frameworkSelectionSchema)
      .parse(JSON.parse(row.framework_selections_json)),
    explorationThemes: z
      .array(explorationThemeSchema)
      .parse(JSON.parse(row.exploration_themes_json)),
    assessedAt: row.assessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Session Charters
// ---------------------------------------------------------------------------

export type PersistedSessionCharters = {
  readonly id: number;
  readonly riskAssessmentId: number;
  readonly charters: readonly SessionCharter[];
  readonly generatedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type SessionChartersRow = {
  readonly id: number;
  readonly risk_assessment_id: number;
  readonly charters_json: string;
  readonly generated_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export function saveSessionCharters(
  databasePath: string,
  result: SessionCharterGenerationResult,
): PersistedSessionCharters {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO session_charters (
            risk_assessment_id, charters_json, generated_at,
            created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5)
          ON CONFLICT(risk_assessment_id) DO UPDATE SET
            charters_json = excluded.charters_json,
            generated_at = excluded.generated_at,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          result.riskAssessmentId,
          JSON.stringify(result.charters),
          result.generatedAt,
          timestamp,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM session_charters
          WHERE risk_assessment_id = ?1
          `,
        )
        .get<SessionChartersRow>(result.riskAssessmentId);
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist session charters for risk_assessment_id=${result.riskAssessmentId}`,
      );
    }

    return mapSessionChartersRow(row);
  } finally {
    database.close();
  }
}

export function findSessionCharters(
  databasePath: string,
  riskAssessmentId: number,
): PersistedSessionCharters | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query(
        `
        SELECT * FROM session_charters
        WHERE risk_assessment_id = ?1
        `,
      )
      .get<SessionChartersRow>(riskAssessmentId);

    return row ? mapSessionChartersRow(row) : null;
  } finally {
    database.close();
  }
}

export function findSessionChartersById(
  databasePath: string,
  id: number,
): PersistedSessionCharters | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM session_charters WHERE id = ?1")
      .get<SessionChartersRow>(id);

    return row ? mapSessionChartersRow(row) : null;
  } finally {
    database.close();
  }
}

function mapSessionChartersRow(
  row: SessionChartersRow,
): PersistedSessionCharters {
  return {
    id: row.id,
    riskAssessmentId: row.risk_assessment_id,
    charters: z
      .array(sessionCharterSchema)
      .parse(JSON.parse(row.charters_json)),
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type PersistedSession = {
  readonly id: number;
  readonly sessionChartersId: number;
  readonly charterIndex: number;
  readonly charterTitle: string;
  readonly status: SessionStatus;
  readonly startedAt: string | null;
  readonly interruptedAt: string | null;
  readonly completedAt: string | null;
  readonly interruptReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type SessionRow = {
  readonly id: number;
  readonly session_charters_id: number;
  readonly charter_index: number;
  readonly charter_title: string;
  readonly status: string;
  readonly started_at: string | null;
  readonly interrupted_at: string | null;
  readonly completed_at: string | null;
  readonly interrupt_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type SaveSessionInput = {
  readonly sessionChartersId: number;
  readonly charterIndex: number;
  readonly charterTitle: string;
};

export function saveSession(
  databasePath: string,
  input: SaveSessionInput,
): PersistedSession {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO sessions (
            session_charters_id, charter_index, charter_title,
            status, started_at, interrupted_at, completed_at,
            interrupt_reason, created_at, updated_at
          ) VALUES (?1, ?2, ?3, 'planned', NULL, NULL, NULL, NULL, ?4, ?5)
          ON CONFLICT(session_charters_id, charter_index) DO UPDATE SET
            charter_title = excluded.charter_title,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          input.sessionChartersId,
          input.charterIndex,
          input.charterTitle,
          timestamp,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM sessions
          WHERE session_charters_id = ?1 AND charter_index = ?2
          `,
        )
        .get<SessionRow>(input.sessionChartersId, input.charterIndex);
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist session for session_charters_id=${input.sessionChartersId}, charter_index=${input.charterIndex}`,
      );
    }

    return mapSessionRow(row);
  } finally {
    database.close();
  }
}

export type UpdateSessionStatusInput = {
  readonly sessionId: number;
  readonly status: SessionStatus;
  readonly startedAt?: string;
  readonly interruptedAt?: string | null;
  readonly completedAt?: string | null;
  readonly interruptReason?: string | null;
};

export function updateSessionStatus(
  databasePath: string,
  input: UpdateSessionStatusInput,
): PersistedSession {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          UPDATE sessions SET
            status = ?2,
            started_at = CASE WHEN ?3 IS NOT NULL THEN ?3 ELSE started_at END,
            interrupted_at = ?4,
            completed_at = ?5,
            interrupt_reason = ?6,
            updated_at = ?7
          WHERE id = ?1
          `,
        )
        .run(
          input.sessionId,
          input.status,
          input.startedAt ?? null,
          input.interruptedAt ?? null,
          input.completedAt ?? null,
          input.interruptReason ?? null,
          timestamp,
        );

      return database
        .query("SELECT * FROM sessions WHERE id = ?1")
        .get<SessionRow>(input.sessionId);
    });

    const row = persist();

    if (!row) {
      throw new Error(`Session not found: id=${input.sessionId}`);
    }

    return mapSessionRow(row);
  } finally {
    database.close();
  }
}

export function findSession(
  databasePath: string,
  sessionId: number,
): PersistedSession | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM sessions WHERE id = ?1")
      .get<SessionRow>(sessionId);

    return row ? mapSessionRow(row) : null;
  } finally {
    database.close();
  }
}

export function listSessionsByChartersId(
  databasePath: string,
  sessionChartersId: number,
): readonly PersistedSession[] {
  const database = openDatabase(databasePath);

  try {
    const rows = database
      .query(
        `
        SELECT * FROM sessions
        WHERE session_charters_id = ?1
        ORDER BY charter_index
        `,
      )
      .all<SessionRow>(sessionChartersId);

    return rows.map(mapSessionRow);
  } finally {
    database.close();
  }
}

function mapSessionRow(row: SessionRow): PersistedSession {
  return {
    id: row.id,
    sessionChartersId: row.session_charters_id,
    charterIndex: row.charter_index,
    charterTitle: row.charter_title,
    status: sessionStatusSchema.parse(row.status),
    startedAt: row.started_at,
    interruptedAt: row.interrupted_at,
    completedAt: row.completed_at,
    interruptReason: row.interrupt_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export type PersistedObservation = {
  readonly id: number;
  readonly sessionId: number;
  readonly observationOrder: number;
  readonly targetedHeuristic: string;
  readonly action: string;
  readonly expected: string;
  readonly actual: string;
  readonly outcome: Observation["outcome"];
  readonly note: string;
  readonly evidencePath: string | null;
  readonly createdAt: string;
};

type ObservationRow = {
  readonly id: number;
  readonly session_id: number;
  readonly observation_order: number;
  readonly targeted_heuristic: string;
  readonly action: string;
  readonly expected: string;
  readonly actual: string;
  readonly outcome: string;
  readonly note: string;
  readonly evidence_path: string | null;
  readonly created_at: string;
};

export type SaveObservationInput = {
  readonly sessionId: number;
  readonly targetedHeuristic: string;
  readonly action: string;
  readonly expected: string;
  readonly actual: string;
  readonly outcome: Observation["outcome"];
  readonly note: string;
  readonly evidencePath: string | null;
};

export function saveObservation(
  databasePath: string,
  input: SaveObservationInput,
): PersistedObservation {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      const nextOrder =
        database
          .query(
            "SELECT COALESCE(MAX(observation_order), 0) AS max_order FROM observations WHERE session_id = ?1",
          )
          .get<{ readonly max_order: number }>(input.sessionId)?.max_order ?? 0;

      const observationOrder = nextOrder + 1;

      database
        .query(
          `
          INSERT INTO observations (
            session_id, observation_order,
            targeted_heuristic, action, expected, actual,
            outcome, note, evidence_path, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          `,
        )
        .run(
          input.sessionId,
          observationOrder,
          input.targetedHeuristic,
          input.action,
          input.expected,
          input.actual,
          input.outcome,
          input.note,
          input.evidencePath,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM observations
          WHERE session_id = ?1 AND observation_order = ?2
          `,
        )
        .get<ObservationRow>(input.sessionId, observationOrder);
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist observation for session_id=${input.sessionId}`,
      );
    }

    return mapObservationRow(row);
  } finally {
    database.close();
  }
}

export function listObservations(
  databasePath: string,
  sessionId: number,
): readonly PersistedObservation[] {
  const database = openDatabase(databasePath);

  try {
    const rows = database
      .query(
        `
        SELECT * FROM observations
        WHERE session_id = ?1
        ORDER BY observation_order
        `,
      )
      .all<ObservationRow>(sessionId);

    return rows.map(mapObservationRow);
  } finally {
    database.close();
  }
}

export function findObservation(
  databasePath: string,
  observationId: number,
): PersistedObservation | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM observations WHERE id = ?1")
      .get<ObservationRow>(observationId);

    return row ? mapObservationRow(row) : null;
  } finally {
    database.close();
  }
}

function mapObservationRow(row: ObservationRow): PersistedObservation {
  return {
    id: row.id,
    sessionId: row.session_id,
    observationOrder: row.observation_order,
    targetedHeuristic: row.targeted_heuristic,
    action: row.action,
    expected: row.expected,
    actual: row.actual,
    outcome: observationOutcomeSchema.parse(row.outcome),
    note: row.note,
    evidencePath: row.evidence_path,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type PersistedFinding = {
  readonly id: number;
  readonly sessionId: number;
  readonly observationId: number;
  readonly type: FindingType;
  readonly title: string;
  readonly description: string;
  readonly severity: FindingSeverity;
  readonly recommendedTestLayer: RecommendedTestLayer | null;
  readonly automationRationale: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type FindingRow = {
  readonly id: number;
  readonly session_id: number;
  readonly observation_id: number;
  readonly type: string;
  readonly title: string;
  readonly description: string;
  readonly severity: string;
  readonly recommended_test_layer: string | null;
  readonly automation_rationale: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type SaveFindingInput = {
  readonly sessionId: number;
  readonly observationId: number;
  readonly type: FindingType;
  readonly title: string;
  readonly description: string;
  readonly severity: FindingSeverity;
  readonly recommendedTestLayer: RecommendedTestLayer | null;
  readonly automationRationale: string | null;
};

export function saveFinding(
  databasePath: string,
  input: SaveFindingInput,
): PersistedFinding {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO findings (
            session_id, observation_id, type, title, description,
            severity, recommended_test_layer, automation_rationale,
            created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          `,
        )
        .run(
          input.sessionId,
          input.observationId,
          input.type,
          input.title,
          input.description,
          input.severity,
          input.recommendedTestLayer,
          input.automationRationale,
          timestamp,
          timestamp,
        );

      return database
        .query(
          `
          SELECT * FROM findings
          WHERE session_id = ?1 AND observation_id = ?2 AND type = ?3 AND created_at = ?4
          ORDER BY id DESC LIMIT 1
          `,
        )
        .get<FindingRow>(
          input.sessionId,
          input.observationId,
          input.type,
          timestamp,
        );
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist finding for session_id=${input.sessionId}, observation_id=${input.observationId}`,
      );
    }

    return mapFindingRow(row);
  } finally {
    database.close();
  }
}

export function listFindings(
  databasePath: string,
  sessionId: number,
): readonly PersistedFinding[] {
  const database = openDatabase(databasePath);

  try {
    const rows = database
      .query(
        `
        SELECT * FROM findings
        WHERE session_id = ?1
        ORDER BY id
        `,
      )
      .all<FindingRow>(sessionId);

    return rows.map(mapFindingRow);
  } finally {
    database.close();
  }
}

export function listFindingsByType(
  databasePath: string,
  sessionId: number,
  type: FindingType,
): readonly PersistedFinding[] {
  const database = openDatabase(databasePath);

  try {
    const rows = database
      .query(
        `
        SELECT * FROM findings
        WHERE session_id = ?1 AND type = ?2
        ORDER BY id
        `,
      )
      .all<FindingRow>(sessionId, type);

    return rows.map(mapFindingRow);
  } finally {
    database.close();
  }
}

function mapFindingRow(row: FindingRow): PersistedFinding {
  return {
    id: row.id,
    sessionId: row.session_id,
    observationId: row.observation_id,
    type: findingTypeSchema.parse(row.type),
    title: row.title,
    description: row.description,
    severity: findingSeveritySchema.parse(row.severity),
    recommendedTestLayer: row.recommended_test_layer
      ? recommendedTestLayerSchema.parse(row.recommended_test_layer)
      : null,
    automationRationale: row.automation_rationale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
