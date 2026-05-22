-- Append-only follow-up notes on submitted inspections (caretaker operational updates).
CREATE TABLE IF NOT EXISTS inspection_updates (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  author_email VARCHAR(255) NOT NULL,
  author_name VARCHAR(255),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inspection_updates_inspection_id_created_at_idx
  ON inspection_updates (inspection_id, created_at ASC);
