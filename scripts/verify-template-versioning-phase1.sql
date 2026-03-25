-- Phase 1 evidence: template versioning completeness + historic protection

-- 1) Table/model evidence
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'template_versions'
ORDER BY ordinal_position;

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'inspections' AND column_name IN ('template_version_id', 'template_version', 'template_id')
ORDER BY column_name;

-- 2) Example snapshot payload
SELECT
  id,
  template_id,
  version_hash,
  jsonb_pretty(snapshot) AS snapshot_pretty
FROM template_versions
ORDER BY created_at DESC
LIMIT 1;

-- 3) Change detection evidence (latest vs previous)
WITH ranked AS (
  SELECT
    id,
    template_id,
    template_name,
    version_hash,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY created_at DESC, id DESC) AS rn
  FROM template_versions
)
SELECT * FROM ranked WHERE rn <= 2 ORDER BY template_id, rn;

-- 4) Historic protection example:
-- Replace :template_id with a template that has at least 2 versions.
WITH versions AS (
  SELECT id, template_id, created_at, version_hash
  FROM template_versions
  WHERE template_id = :template_id
  ORDER BY created_at ASC, id ASC
),
picked AS (
  SELECT
    (SELECT id FROM versions ORDER BY created_at ASC, id ASC LIMIT 1) AS old_version_id,
    (SELECT id FROM versions ORDER BY created_at DESC, id DESC LIMIT 1) AS new_version_id
)
SELECT
  i.id AS inspection_id,
  i.created_at,
  i.template_version_id,
  CASE
    WHEN i.template_version_id = p.old_version_id THEN 'Inspection A (old)'
    WHEN i.template_version_id = p.new_version_id THEN 'Inspection B (new)'
    ELSE 'other'
  END AS expected_role
FROM inspections i
CROSS JOIN picked p
WHERE i.template_id = :template_id
  AND i.template_version_id IN (p.old_version_id, p.new_version_id)
ORDER BY i.created_at ASC;

-- 5) Confirm old inspection still renders from old snapshot
-- (question count can differ between old/new versions)
WITH versions AS (
  SELECT id, template_id, snapshot
  FROM template_versions
  WHERE template_id = :template_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1
),
inspection_old AS (
  SELECT i.id, i.template_version_id, i.template_version
  FROM inspections i
  JOIN versions v ON v.id = i.template_version_id
  ORDER BY i.created_at ASC
  LIMIT 1
)
SELECT
  io.id AS inspection_id,
  io.template_version_id,
  jsonb_array_length(COALESCE(io.template_version->'sections', '[]'::jsonb)) AS sections_on_inspection_snapshot
FROM inspection_old io;
