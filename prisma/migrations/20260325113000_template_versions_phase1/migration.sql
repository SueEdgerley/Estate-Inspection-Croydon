-- Phase 1 completion: persisted template versions + inspection pinning

CREATE TABLE IF NOT EXISTS template_versions (
  id VARCHAR(255) PRIMARY KEY,
  template_id VARCHAR(255) NOT NULL,
  template_name VARCHAR(255),
  version_hash VARCHAR(64) NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_created
  ON template_versions (template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_hash
  ON template_versions (template_id, version_hash);

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS template_version_id VARCHAR(255);

ALTER TABLE inspections
  ADD CONSTRAINT inspections_template_version_id_fk
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE SET NULL;

-- Backfill: create one template_versions row per distinct existing inspection snapshot
INSERT INTO template_versions (id, template_id, template_name, version_hash, snapshot, created_at)
SELECT
  'tv_' || md5(
    COALESCE(i.template_id, 'unknown') || '|' ||
    md5(COALESCE(i.template_version::text, '{}'))
  ) AS id,
  COALESCE(i.template_id, 'unknown') AS template_id,
  i.template_name,
  md5(COALESCE(i.template_version::text, '{}')) AS version_hash,
  COALESCE(i.template_version, '{}'::jsonb) AS snapshot,
  COALESCE(i.created_at, CURRENT_TIMESTAMP) AS created_at
FROM inspections i
WHERE i.template_version IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Attach inspections to their backfilled template_version_id
UPDATE inspections i
SET template_version_id = tv.id
FROM template_versions tv
WHERE i.template_version_id IS NULL
  AND i.template_version IS NOT NULL
  AND tv.template_id = COALESCE(i.template_id, 'unknown')
  AND tv.version_hash = md5(COALESCE(i.template_version::text, '{}'));
