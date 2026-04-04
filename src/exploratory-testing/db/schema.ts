export const PR_INTAKE_CONTEXTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS pr_intake_contexts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_intake_id INTEGER NOT NULL UNIQUE
    REFERENCES pr_intakes(id)
    ON DELETE CASCADE,
  change_purpose TEXT
    CHECK (change_purpose IS NULL OR change_purpose IN (
      'feature', 'bugfix', 'refactor', 'config', 'docs', 'other'
    )),
  user_story TEXT,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  non_goals_json TEXT NOT NULL DEFAULT '[]',
  target_users_json TEXT NOT NULL DEFAULT '[]',
  notes_for_qa_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  extraction_status TEXT NOT NULL
    CHECK (extraction_status IN ('empty', 'parsed', 'partial')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const WORKSPACE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workflow_steps (
  step_name TEXT PRIMARY KEY,
  step_order INTEGER NOT NULL UNIQUE,
  skill_name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config_path TEXT NOT NULL,
  repository_root TEXT NOT NULL,
  database_path TEXT NOT NULL,
  progress_directory TEXT NOT NULL,
  progress_summary_path TEXT NOT NULL,
  artifacts_directory TEXT NOT NULL,
  scm_provider TEXT NOT NULL,
  default_language TEXT NOT NULL,
  initialized_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS step_progress (
  step_name TEXT PRIMARY KEY
    REFERENCES workflow_steps(step_name)
    ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN (
      'pending',
      'in_progress',
      'completed',
      'interrupted',
      'failed',
      'skipped'
    )),
  summary TEXT NOT NULL DEFAULT '',
  next_step TEXT
    REFERENCES workflow_steps(step_name)
    ON DELETE SET NULL,
  progress_path TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS handover_documents (
  step_name TEXT PRIMARY KEY
    REFERENCES workflow_steps(step_name)
    ON DELETE CASCADE,
  frontmatter_json TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pr_intakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  repository TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  linked_issues_json TEXT NOT NULL DEFAULT '[]',
  changed_files_json TEXT NOT NULL DEFAULT '[]',
  review_comments_json TEXT NOT NULL DEFAULT '[]',
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, repository, pr_number, head_sha)
);

CREATE TABLE IF NOT EXISTS change_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_intake_id INTEGER NOT NULL UNIQUE
    REFERENCES pr_intakes(id)
    ON DELETE CASCADE,
  file_analyses_json TEXT NOT NULL DEFAULT '[]',
  related_codes_json TEXT NOT NULL DEFAULT '[]',
  viewpoint_seeds_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  analyzed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_step_progress_status
  ON step_progress(status);

CREATE INDEX IF NOT EXISTS idx_step_progress_updated_at
  ON step_progress(updated_at);

CREATE TABLE IF NOT EXISTS test_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_analysis_id INTEGER NOT NULL UNIQUE
    REFERENCES change_analyses(id)
    ON DELETE CASCADE,
  pr_intake_id INTEGER NOT NULL
    REFERENCES pr_intakes(id)
    ON DELETE CASCADE,
  test_assets_json TEXT NOT NULL DEFAULT '[]',
  test_summaries_json TEXT NOT NULL DEFAULT '[]',
  coverage_gap_map_json TEXT NOT NULL DEFAULT '[]',
  missing_layers_json TEXT NOT NULL DEFAULT '[]',
  mapped_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_mapping_id INTEGER NOT NULL UNIQUE
    REFERENCES test_mappings(id)
    ON DELETE CASCADE,
  risk_scores_json TEXT NOT NULL DEFAULT '[]',
  framework_selections_json TEXT NOT NULL DEFAULT '[]',
  exploration_themes_json TEXT NOT NULL DEFAULT '[]',
  assessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allocation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  risk_assessment_id INTEGER NOT NULL
    REFERENCES risk_assessments(id)
    ON DELETE CASCADE,
  title TEXT NOT NULL,
  changed_file_paths_json TEXT NOT NULL DEFAULT '[]',
  risk_level TEXT NOT NULL
    CHECK (risk_level IN ('high', 'medium', 'low')),
  recommended_destination TEXT NOT NULL
    CHECK (recommended_destination IN (
      'review',
      'unit',
      'integration',
      'e2e',
      'visual',
      'dev-box',
      'manual-exploration',
      'skip'
    )),
  confidence REAL NOT NULL
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  rationale TEXT NOT NULL,
  source_signals_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allocation_items_risk_assessment_id
  ON allocation_items(risk_assessment_id);

CREATE INDEX IF NOT EXISTS idx_allocation_items_destination
  ON allocation_items(recommended_destination);

CREATE TABLE IF NOT EXISTS session_charters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  risk_assessment_id INTEGER NOT NULL UNIQUE
    REFERENCES risk_assessments(id)
    ON DELETE CASCADE,
  charters_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_charters_id INTEGER NOT NULL
    REFERENCES session_charters(id)
    ON DELETE CASCADE,
  charter_index INTEGER NOT NULL,
  charter_title TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN (
      'planned',
      'in_progress',
      'interrupted',
      'completed'
    )),
  started_at TEXT,
  interrupted_at TEXT,
  completed_at TEXT,
  interrupt_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (session_charters_id, charter_index)
);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL
    REFERENCES sessions(id)
    ON DELETE CASCADE,
  observation_order INTEGER NOT NULL,
  targeted_heuristic TEXT NOT NULL,
  action TEXT NOT NULL,
  expected TEXT NOT NULL,
  actual TEXT NOT NULL,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('pass', 'fail', 'unclear', 'suspicious')),
  note TEXT NOT NULL DEFAULT '',
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, observation_order)
);

CREATE TABLE IF NOT EXISTS pr_intake_contexts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_intake_id INTEGER NOT NULL UNIQUE
    REFERENCES pr_intakes(id)
    ON DELETE CASCADE,
  change_purpose TEXT
    CHECK (change_purpose IS NULL OR change_purpose IN (
      'feature', 'bugfix', 'refactor', 'config', 'docs', 'other'
    )),
  user_story TEXT,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  non_goals_json TEXT NOT NULL DEFAULT '[]',
  target_users_json TEXT NOT NULL DEFAULT '[]',
  notes_for_qa_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  extraction_status TEXT NOT NULL
    CHECK (extraction_status IN ('empty', 'parsed', 'partial')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pr_intakes_lookup
  ON pr_intakes(provider, repository, pr_number);

CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON sessions(status);

CREATE INDEX IF NOT EXISTS idx_observations_session_id
  ON observations(session_id);

CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL
    REFERENCES sessions(id)
    ON DELETE CASCADE,
  observation_id INTEGER NOT NULL
    REFERENCES observations(id)
    ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('defect', 'spec-gap', 'automation-candidate')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  recommended_test_layer TEXT
    CHECK (recommended_test_layer IS NULL OR recommended_test_layer IN (
      'unit', 'integration', 'e2e', 'visual', 'api'
    )),
  automation_rationale TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_findings_session_id
  ON findings(session_id);

CREATE INDEX IF NOT EXISTS idx_findings_type
  ON findings(type);
`;
