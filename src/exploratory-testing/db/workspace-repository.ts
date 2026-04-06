import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";

import { v } from "../lib/validation";
import {
  type AllocationDestination,
  type AllocationDestinationCounts,
  type AllocationItem,
  type AllocationSourceSignals,
  allocationDestinationSchema,
  allocationItemSchema,
  allocationSourceSignalsSchema,
  createEmptyAllocationDestinationCounts,
} from "../models/allocation";
import {
  type ChangeAnalysisResult,
  fileChangeAnalysisSchema,
  relatedCodeCandidateSchema,
  viewpointSeedSchema,
} from "../models/change-analysis";
import {
  type IntentContext,
  changePurposeSchema,
  extractionStatusSchema,
} from "../models/intent-context";
import {
  type PrMetadata,
  changedFileSchema,
  reviewCommentSchema,
} from "../models/pr-intake";
import {
  type RiskAssessmentResult,
  explorationThemeSchema,
  frameworkSelectionSchema,
  riskScoreSchema,
} from "../models/risk-assessment";
import {
  type TestMappingResult,
  coverageGapEntrySchema,
  explorationPrioritySchema,
  testAssetSchema,
  testLayerSchema,
  testSummarySchema,
} from "../models/test-mapping";
import { PR_INTAKE_CONTEXTS_TABLE_SQL, WORKSPACE_SCHEMA_SQL } from "./schema";

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

export function initializeWorkspaceDatabase(databasePath: string): void {
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = openDatabase(databasePath);

  try {
    database.exec(WORKSPACE_SCHEMA_SQL);
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

function openDatabase(databasePath: string): Database {
  const database = new Database(databasePath, {
    create: true,
  });

  database.exec("PRAGMA journal_mode=WAL;");
  database.exec("PRAGMA foreign_keys=ON;");

  return database;
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

export function findPrIntakeById(
  databasePath: string,
  id: number,
): PersistedPrIntake | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM pr_intakes WHERE id = ?1")
      .get<PrIntakeRow>(id);

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
    linkedIssues: v.parse(
      v.array(v.string()),
      JSON.parse(row.linked_issues_json),
    ),
    changedFiles: v.parse(
      v.array(changedFileSchema),
      JSON.parse(row.changed_files_json),
    ),
    reviewComments: v.parse(
      v.array(reviewCommentSchema),
      JSON.parse(row.review_comments_json),
    ),
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Intent Context repository ---

export type PersistedIntentContext = IntentContext & {
  readonly id: number;
  readonly prIntakeId: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type IntentContextRow = {
  readonly id: number;
  readonly pr_intake_id: number;
  readonly change_purpose: string | null;
  readonly user_story: string | null;
  readonly acceptance_criteria_json: string;
  readonly non_goals_json: string;
  readonly target_users_json: string;
  readonly notes_for_qa_json: string;
  readonly source_refs_json: string;
  readonly extraction_status: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export function saveIntentContext(
  databasePath: string,
  prIntakeId: number,
  context: IntentContext,
): PersistedIntentContext {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    // Defensive: ensure table exists for pre-existing workspaces
    // that were initialized before this feature was added.
    database.exec(PR_INTAKE_CONTEXTS_TABLE_SQL);

    const persist = database.transaction(() => {
      database
        .query(
          `
          INSERT INTO pr_intake_contexts (
            pr_intake_id, change_purpose, user_story,
            acceptance_criteria_json, non_goals_json, target_users_json,
            notes_for_qa_json, source_refs_json, extraction_status,
            created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(pr_intake_id) DO UPDATE SET
            change_purpose = excluded.change_purpose,
            user_story = excluded.user_story,
            acceptance_criteria_json = excluded.acceptance_criteria_json,
            non_goals_json = excluded.non_goals_json,
            target_users_json = excluded.target_users_json,
            notes_for_qa_json = excluded.notes_for_qa_json,
            source_refs_json = excluded.source_refs_json,
            extraction_status = excluded.extraction_status,
            updated_at = excluded.updated_at
          `,
        )
        .run(
          prIntakeId,
          context.changePurpose,
          context.userStory,
          JSON.stringify(context.acceptanceCriteria),
          JSON.stringify(context.nonGoals),
          JSON.stringify(context.targetUsers),
          JSON.stringify(context.notesForQa),
          JSON.stringify(context.sourceRefs),
          context.extractionStatus,
          timestamp,
          timestamp,
        );

      return database
        .query("SELECT * FROM pr_intake_contexts WHERE pr_intake_id = ?1")
        .get<IntentContextRow>(prIntakeId);
    });

    const row = persist();

    if (!row) {
      throw new Error(
        `Failed to persist intent context for pr_intake_id=${prIntakeId}`,
      );
    }

    return mapIntentContextRow(row);
  } finally {
    database.close();
  }
}

export function findIntentContext(
  databasePath: string,
  prIntakeId: number,
): PersistedIntentContext | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM pr_intake_contexts WHERE pr_intake_id = ?1")
      .get<IntentContextRow>(prIntakeId);

    return row ? mapIntentContextRow(row) : null;
  } finally {
    database.close();
  }
}

function mapIntentContextRow(row: IntentContextRow): PersistedIntentContext {
  return {
    id: row.id,
    prIntakeId: row.pr_intake_id,
    changePurpose: row.change_purpose
      ? changePurposeSchema.parse(row.change_purpose)
      : null,
    userStory: row.user_story,
    acceptanceCriteria: v.parse(
      v.array(v.string()),
      JSON.parse(row.acceptance_criteria_json),
    ),
    nonGoals: v.parse(v.array(v.string()), JSON.parse(row.non_goals_json)),
    targetUsers: v.parse(
      v.array(v.string()),
      JSON.parse(row.target_users_json),
    ),
    notesForQa: v.parse(v.array(v.string()), JSON.parse(row.notes_for_qa_json)),
    sourceRefs: v.parse(v.array(v.string()), JSON.parse(row.source_refs_json)),
    extractionStatus: extractionStatusSchema.parse(row.extraction_status),
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

export function findChangeAnalysisById(
  databasePath: string,
  id: number,
): PersistedChangeAnalysis | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM change_analyses WHERE id = ?1")
      .get<ChangeAnalysisRow>(id);

    return row ? mapChangeAnalysisRow(row) : null;
  } finally {
    database.close();
  }
}

function mapChangeAnalysisRow(row: ChangeAnalysisRow): PersistedChangeAnalysis {
  return {
    id: row.id,
    prIntakeId: row.pr_intake_id,
    fileAnalyses: v.parse(
      v.array(fileChangeAnalysisSchema),
      JSON.parse(row.file_analyses_json),
    ),
    relatedCodes: v.parse(
      v.array(relatedCodeCandidateSchema),
      JSON.parse(row.related_codes_json),
    ),
    viewpointSeeds: v.parse(
      v.array(viewpointSeedSchema),
      JSON.parse(row.viewpoint_seeds_json),
    ),
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

export function findTestMappingById(
  databasePath: string,
  id: number,
): PersistedTestMapping | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM test_mappings WHERE id = ?1")
      .get<TestMappingRow>(id);

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
    testAssets: v.parse(
      v.array(testAssetSchema),
      JSON.parse(row.test_assets_json),
    ),
    testSummaries: v.parse(
      v.array(testSummarySchema),
      JSON.parse(row.test_summaries_json),
    ),
    coverageGapMap: v.parse(
      v.array(coverageGapEntrySchema),
      JSON.parse(row.coverage_gap_map_json),
    ),
    missingLayers: v.parse(
      v.array(testLayerSchema),
      JSON.parse(row.missing_layers_json),
    ),
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

export function findRiskAssessmentById(
  databasePath: string,
  id: number,
): PersistedRiskAssessment | null {
  const database = openDatabase(databasePath);

  try {
    const row = database
      .query("SELECT * FROM risk_assessments WHERE id = ?1")
      .get<RiskAssessmentRow>(id);

    return row ? mapRiskAssessmentRow(row) : null;
  } finally {
    database.close();
  }
}

function mapRiskAssessmentRow(row: RiskAssessmentRow): PersistedRiskAssessment {
  return {
    id: row.id,
    testMappingId: row.test_mapping_id,
    riskScores: v.parse(
      v.array(riskScoreSchema),
      JSON.parse(row.risk_scores_json),
    ),
    frameworkSelections: v.parse(
      v.array(frameworkSelectionSchema),
      JSON.parse(row.framework_selections_json),
    ),
    explorationThemes: v.parse(
      v.array(explorationThemeSchema),
      JSON.parse(row.exploration_themes_json),
    ),
    assessedAt: row.assessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Allocation Items
// ---------------------------------------------------------------------------

export type PersistedAllocationItem = {
  readonly id: number;
  readonly riskAssessmentId: number;
  readonly title: string;
  readonly changedFilePaths: readonly string[];
  readonly riskLevel: AllocationItem["riskLevel"];
  readonly recommendedDestination: AllocationDestination;
  readonly confidence: number;
  readonly rationale: string;
  readonly sourceSignals: AllocationSourceSignals;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type AllocationItemRow = {
  readonly id: number;
  readonly risk_assessment_id: number;
  readonly title: string;
  readonly changed_file_paths_json: string;
  readonly risk_level: string;
  readonly recommended_destination: string;
  readonly confidence: number;
  readonly rationale: string;
  readonly source_signals_json: string;
  readonly created_at: string;
  readonly updated_at: string;
};

type AllocationCountRow = {
  readonly destination: string;
  readonly count: number;
};

export function saveAllocationItems(
  databasePath: string,
  riskAssessmentId: number,
  items: readonly AllocationItem[],
): readonly PersistedAllocationItem[] {
  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();

  try {
    const riskAssessment = requireRiskAssessment(
      databasePath,
      riskAssessmentId,
    );

    const normalizedItems = items.map((item) =>
      allocationItemSchema.parse({
        ...item,
        riskAssessmentId,
      }),
    );

    for (const item of normalizedItems) {
      if (item.riskAssessmentId !== riskAssessmentId) {
        throw new Error(
          `Allocation item riskAssessmentId mismatch: expected ${riskAssessmentId}, got ${item.riskAssessmentId}`,
        );
      }
    }

    const persist = database.transaction(() => {
      database
        .query("DELETE FROM allocation_items WHERE risk_assessment_id = ?1")
        .run(riskAssessmentId);

      const insert = database.query(
        `
        INSERT INTO allocation_items (
          risk_assessment_id,
          title,
          changed_file_paths_json,
          risk_level,
          recommended_destination,
          confidence,
          rationale,
          source_signals_json,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        `,
      );

      for (const item of normalizedItems) {
        insert.run(
          riskAssessment.id,
          item.title,
          JSON.stringify(item.changedFilePaths),
          item.riskLevel,
          item.recommendedDestination,
          item.confidence,
          item.rationale,
          JSON.stringify(item.sourceSignals),
          timestamp,
          timestamp,
        );
      }

      return database
        .query(
          `
          SELECT * FROM allocation_items
          WHERE risk_assessment_id = ?1
          ORDER BY id
          `,
        )
        .all<AllocationItemRow>(riskAssessmentId);
    });

    const rows = persist();
    return rows.map(mapAllocationItemRow);
  } finally {
    database.close();
  }
}

export function listAllocationItems(
  databasePath: string,
  riskAssessmentId: number,
): readonly PersistedAllocationItem[] {
  const database = openDatabase(databasePath);

  try {
    requireRiskAssessment(databasePath, riskAssessmentId);
    const rows = database
      .query(
        `
        SELECT * FROM allocation_items
        WHERE risk_assessment_id = ?1
        ORDER BY id
        `,
      )
      .all<AllocationItemRow>(riskAssessmentId);

    return rows.map(mapAllocationItemRow);
  } finally {
    database.close();
  }
}

export function listAllocationItemsByDestination(
  databasePath: string,
  riskAssessmentId: number,
  destination: AllocationDestination,
): readonly PersistedAllocationItem[] {
  const database = openDatabase(databasePath);

  try {
    requireRiskAssessment(databasePath, riskAssessmentId);
    const rows = database
      .query(
        `
        SELECT * FROM allocation_items
        WHERE risk_assessment_id = ?1
          AND recommended_destination = ?2
        ORDER BY id
        `,
      )
      .all<AllocationItemRow>(riskAssessmentId, destination);

    return rows.map(mapAllocationItemRow);
  } finally {
    database.close();
  }
}

export function countAllocationItemsByDestination(
  databasePath: string,
  riskAssessmentId: number,
): AllocationDestinationCounts {
  const database = openDatabase(databasePath);

  try {
    requireRiskAssessment(databasePath, riskAssessmentId);
    const counts = createEmptyAllocationDestinationCounts();
    const rows = database
      .query(
        `
        SELECT recommended_destination AS destination, COUNT(*) AS count
        FROM allocation_items
        WHERE risk_assessment_id = ?1
        GROUP BY recommended_destination
        `,
      )
      .all<AllocationCountRow>(riskAssessmentId);

    for (const row of rows) {
      const destination = allocationDestinationSchema.parse(row.destination);
      counts[destination] = row.count;
    }

    return counts;
  } finally {
    database.close();
  }
}

function requireRiskAssessment(
  databasePath: string,
  riskAssessmentId: number,
): PersistedRiskAssessment {
  const riskAssessment = findRiskAssessmentById(databasePath, riskAssessmentId);

  if (!riskAssessment) {
    throw new Error(
      `Risk assessment not found for id=${riskAssessmentId}. Run assess-gaps first.`,
    );
  }

  return riskAssessment;
}

function mapAllocationItemRow(row: AllocationItemRow): PersistedAllocationItem {
  return {
    id: row.id,
    riskAssessmentId: row.risk_assessment_id,
    title: row.title,
    changedFilePaths: v.parse(
      v.array(v.string()),
      JSON.parse(row.changed_file_paths_json),
    ),
    riskLevel: v.parse(explorationPrioritySchema, row.risk_level),
    recommendedDestination: allocationDestinationSchema.parse(
      row.recommended_destination,
    ),
    confidence: row.confidence,
    rationale: row.rationale,
    sourceSignals: v.parse(
      allocationSourceSignalsSchema,
      JSON.parse(row.source_signals_json),
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// PR-based record resolution (public flow orchestration)
// ---------------------------------------------------------------------------

/**
 * Resolve the unique (provider, repository) pair for a PR number.
 * Returns null when no intake exists.
 * Throws when multiple distinct (provider, repository) pairs exist for the
 * same PR number — callers must disambiguate with explicit arguments.
 */
export function resolvePrIdentity(
  databasePath: string,
  prNumber: number,
): { readonly provider: string; readonly repository: string } | null {
  const database = openDatabase(databasePath);

  try {
    const rows = database
      .query(
        `
        SELECT DISTINCT provider, repository FROM pr_intakes
        WHERE pr_number = ?1
        `,
      )
      .all<{ readonly provider: string; readonly repository: string }>(
        prNumber,
      );

    if (rows.length === 0) return null;

    if (rows.length > 1) {
      const pairs = rows.map((r) => `${r.provider}/${r.repository}`).join(", ");
      throw new Error(
        `PR #${prNumber} exists under multiple repositories (${pairs}). Specify --provider and --repository to disambiguate.`,
      );
    }

    return rows[0];
  } finally {
    database.close();
  }
}

/**
 * Find the latest risk assessment for a given PR.
 * provider and repository are required to ensure an unambiguous lookup.
 */
export function findLatestRiskAssessmentByPr(
  databasePath: string,
  provider: string,
  repository: string,
  prNumber: number,
): PersistedRiskAssessment | null {
  const prIntake = findPrIntake(databasePath, provider, repository, prNumber);
  if (!prIntake) return null;

  const changeAnalysis = findChangeAnalysis(databasePath, prIntake.id);
  if (!changeAnalysis) return null;

  const testMapping = findTestMapping(databasePath, changeAnalysis.id);
  if (!testMapping) return null;

  return findRiskAssessment(databasePath, testMapping.id);
}
