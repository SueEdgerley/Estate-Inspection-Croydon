CREATE TABLE IF NOT EXISTS action_progress_updates (
  id VARCHAR(255) PRIMARY KEY,
  action_id VARCHAR(255) NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  author_email VARCHAR(255),
  note TEXT,
  status_before VARCHAR(50),
  status_after VARCHAR(50),
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_progress_updates_action_id_created_at_idx
  ON action_progress_updates (action_id, created_at ASC);
