-- Read-only analytics view: graded answers + inspection dimensions + template labels.
-- Does not change application behaviour. Safe to deploy with prisma migrate deploy.

DROP VIEW IF EXISTS v_graded_inspection_answers_analytics;

CREATE VIEW v_graded_inspection_answers_analytics AS
WITH base AS (
  SELECT
    ia.id AS inspection_answer_id,
    ia.inspection_id,
    ia.section_id AS answer_section_id,
    ia.question_id,
    ia.question_type AS answer_question_type,
    ia.answer_value,
    ia.answer_text,
    ia.answer_number,
    ia.notes AS answer_notes,
    ia.created_at AS answer_created_at,
    ia.updated_at AS answer_updated_at,
    i.type AS inspection_type,
    i.status AS inspection_status,
    i.submitted_at,
    i.due_date,
    i.created_at AS inspection_created_at,
    i.estate_id,
    i.block_id,
    i.template_id,
    i.template_name,
    i.template_version_id,
    i.grading AS inspection_summary_grading,
    i.inspector_id,
    i.inspector_name,
    i.location_label,
    e.name AS estate_name,
    b.name AS block_name,
    tv.version_hash AS template_version_hash,
    COALESCE(i.template_version, tv.snapshot) AS template_snapshot,
    NULLIF(
      trim(
        COALESCE(
          ia.answer_value,
          ia.answer_text,
          CASE
            WHEN ia.answer_number IS NOT NULL THEN trim(to_char(ia.answer_number, 'FM999999999999999999.999999999999999999'))
            ELSE NULL
          END
        )
      ),
      ''
    ) AS stored_grade_value
  FROM inspection_answers ia
  INNER JOIN inspections i ON i.id = ia.inspection_id
  LEFT JOIN estates e ON e.id = i.estate_id
  LEFT JOIN blocks b ON b.id = i.block_id
  LEFT JOIN template_versions tv ON tv.id = i.template_version_id
),
matched AS (
  SELECT
    b.*,
    tmpl.section_id,
    tmpl.section_title,
    tmpl.section_sort_order,
    tmpl.question_text,
    tmpl.question_sort_order,
    tmpl.template_question_type,
    tmpl.question_type_raw,
    tmpl.grading_scheme_id,
    tmpl.grading_scheme_name,
    tmpl.grading_options_json
  FROM base b
  LEFT JOIN LATERAL (
    SELECT
      sec_elem ->> 'id' AS section_id,
      sec_elem ->> 'title' AS section_title,
      (sec_elem ->> 'sort_order')::numeric AS section_sort_order,
      q_elem ->> 'question_text' AS question_text,
      (q_elem ->> 'sort_order')::numeric AS question_sort_order,
      q_elem ->> 'question_type' AS template_question_type,
      q_elem ->> 'question_type_raw' AS question_type_raw,
      q_elem ->> 'grading_scheme_id' AS grading_scheme_id,
      q_elem ->> 'grading_scheme_name' AS grading_scheme_name,
      q_elem -> 'grading_options' AS grading_options_json
    FROM jsonb_array_elements(
      COALESCE(b.template_snapshot -> 'sections', '[]'::jsonb)
    ) AS sec(sec_elem)
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(sec_elem -> 'questions', '[]'::jsonb)
    ) AS q(q_elem)
    WHERE q_elem ->> 'id' = b.question_id
    LIMIT 1
  ) tmpl ON true
  WHERE
    lower(trim(COALESCE(tmpl.template_question_type, ''))) = 'graded'
    OR lower(trim(COALESCE(b.answer_question_type, ''))) = 'graded'
),
ranked AS (
  SELECT
    m.*,
    (
      SELECT (t.ord)::integer
      FROM jsonb_array_elements_text(
        COALESCE(
          NULLIF(m.grading_options_json, 'null'::jsonb),
          '["A","B","C","D","NA"]'::jsonb
        )
      ) WITH ORDINALITY AS t(opt, ord)
      WHERE upper(trim(t.opt)) = upper(trim(m.stored_grade_value))
      LIMIT 1
    ) AS grade_rank_ordinal,
    COALESCE(
      (
        SELECT (t.ord)::integer
        FROM jsonb_array_elements_text(
          COALESCE(
            NULLIF(m.grading_options_json, 'null'::jsonb),
            '["A","B","C","D","NA"]'::jsonb
          )
        ) WITH ORDINALITY AS t(opt, ord)
        WHERE upper(trim(t.opt)) = upper(trim(m.stored_grade_value))
        LIMIT 1
      ),
      CASE upper(trim(m.stored_grade_value))
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
        WHEN 'D' THEN 4
        ELSE NULL
      END
    ) AS grade_rank_numeric_fallback
  FROM matched m
)
SELECT
  r.inspection_answer_id,
  r.inspection_id,
  r.inspection_type,
  r.inspection_status,
  r.submitted_at AS inspection_submitted_at,
  r.due_date AS inspection_due_date,
  r.inspection_created_at,
  r.estate_id,
  r.estate_name,
  r.block_id,
  r.block_name,
  r.template_id,
  r.template_name,
  r.template_version_id,
  r.template_version_hash,
  r.answer_section_id,
  r.section_id AS template_section_id,
  r.section_title,
  r.section_sort_order,
  r.question_id,
  r.question_text,
  r.question_sort_order,
  r.question_type_raw,
  r.answer_question_type,
  r.template_question_type,
  r.grading_scheme_id,
  r.grading_scheme_name,
  r.grading_options_json AS grading_options,
  r.stored_grade_value,
  r.inspection_summary_grading,
  r.inspector_id,
  r.inspector_name,
  r.location_label,
  u.id AS user_table_id,
  u.email AS user_email,
  u.clerk_user_id AS user_clerk_id,
  r.grade_rank_ordinal,
  CASE
    WHEN upper(trim(COALESCE(r.stored_grade_value, ''))) IN ('NA', 'N/A') THEN NULL
    ELSE r.grade_rank_ordinal
  END AS grade_rank_for_trend,
  r.grade_rank_numeric_fallback,
  (upper(trim(COALESCE(r.stored_grade_value, ''))) IN ('NA', 'N/A')) AS is_na_grade,
  (
    SELECT count(*)::integer
    FROM actions a
    WHERE a.inspection_id = r.inspection_id
      AND a.question_id = r.question_id
  ) AS action_count,
  (
    SELECT count(*)::integer
    FROM tasks t
    WHERE t.inspection_id = r.inspection_id
      AND t.question_id = r.question_id
  ) AS task_count,
  r.answer_notes,
  r.answer_created_at,
  r.answer_updated_at
FROM ranked r
LEFT JOIN users u
  ON (
    (u.email IS NOT NULL AND lower(trim(u.email)) = lower(trim(r.inspector_id)))
    OR (u.clerk_user_id IS NOT NULL AND u.clerk_user_id = r.inspector_id)
  );

COMMENT ON VIEW v_graded_inspection_answers_analytics IS
  'Analytics validation: graded inspection answers with template labels and rank. '
  'inspection_summary_grading is denormalized convenience only; row-level stored_grade_value is authoritative per question.';
