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

CREATE INDEX IF NOT EXISTS idx_step_progress_status
  ON step_progress(status);

CREATE INDEX IF NOT EXISTS idx_step_progress_updated_at
  ON step_progress(updated_at);
`;
