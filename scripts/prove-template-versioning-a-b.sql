-- Demonstration proof (non-destructive): A pinned to old version, B to new version
-- This script runs inside a transaction and rolls back.

BEGIN;

-- Use deterministic IDs so output is easy to inspect
-- Adjust template_id if it violates local constraints/patterns.
WITH old_snapshot AS (
  SELECT jsonb_build_object(
    'id', 'tmpl_demo',
    'name', 'Demo Template',
    'sections', jsonb_build_array(
      jsonb_build_object(
        'id', 'sec_1',
        'title', 'Safety',
        'questions', jsonb_build_array(
          jsonb_build_object(
            'id', 'q1',
            'question_key', 'escape_routes_clear',
            'question_text', 'Are escape routes clear?',
            'question_type', 'yes_no',
            'answer_mode', 'single',
            'category', 'Safety',
            'issue_type', 'fire_safety',
            'triggers_task', true,
            'triggers_email', true,
            'email_routing', 'team.fire@council.gov',
            'programme_tag', 'nv'
          )
        )
      )
    )
  ) AS s
), new_snapshot AS (
  SELECT jsonb_build_object(
    'id', 'tmpl_demo',
    'name', 'Demo Template',
    'sections', jsonb_build_array(
      jsonb_build_object(
        'id', 'sec_1',
        'title', 'Safety',
        'questions', jsonb_build_array(
          jsonb_build_object(
            'id', 'q1',
            'question_key', 'escape_routes_clear',
            'question_text', 'Are escape routes clear and signed?',
            'question_type', 'yes_no',
            'answer_mode', 'single',
            'category', 'Safety',
            'issue_type', 'fire_safety',
            'triggers_task', true,
            'triggers_email', true,
            'email_routing', 'team.fire@council.gov',
            'programme_tag', 'nv'
          )
        )
      )
    )
  ) AS s
)
INSERT INTO template_versions (id, template_id, template_name, version_hash, snapshot, created_at)
SELECT 'tv_demo_old', 'tmpl_demo', 'Demo Template', md5((SELECT s::text FROM old_snapshot)), (SELECT s FROM old_snapshot), NOW() - INTERVAL '1 day'
UNION ALL
SELECT 'tv_demo_new', 'tmpl_demo', 'Demo Template', md5((SELECT s::text FROM new_snapshot)), (SELECT s FROM new_snapshot), NOW();

INSERT INTO inspections (
  id, type, title, status, template_id, template_name, template_version_id, template_version, created_at, updated_at
)
VALUES
  ('insp_demo_a', 'inspection', 'Inspection A', 'draft', 'tmpl_demo', 'Demo Template', 'tv_demo_old',
   (SELECT snapshot FROM template_versions WHERE id = 'tv_demo_old'), NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('insp_demo_b', 'inspection', 'Inspection B', 'draft', 'tmpl_demo', 'Demo Template', 'tv_demo_new',
   (SELECT snapshot FROM template_versions WHERE id = 'tv_demo_new'), NOW(), NOW());

SELECT
  i.id AS inspection_id,
  i.template_version_id,
  i.template_version #>> '{sections,0,questions,0,question_text}' AS question_text_used_by_inspection
FROM inspections i
WHERE i.id IN ('insp_demo_a', 'insp_demo_b')
ORDER BY i.id;

-- Expected:
-- insp_demo_a -> tv_demo_old -> "Are escape routes clear?"
-- insp_demo_b -> tv_demo_new -> "Are escape routes clear and signed?"
-- This proves old inspections remain pinned/renderable from old snapshot.

ROLLBACK;
