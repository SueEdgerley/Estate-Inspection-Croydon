/**
 * Grade breakdown by block for the selected Analytics period.
 * The caller supplies the completed-inspection WHERE clause, including its date filter.
 * Answer counts and the overall grade both come from that same set of inspections.
 */

export function buildBlockGradeBreakdownSql(whereSql, gradedSql, scoreSql) {
  return `WITH inspected_blocks AS (
          SELECT
            i.block_id,
            MAX(i.submitted_at) AS latest_inspection_at
          FROM inspections i
          WHERE ${whereSql}
            AND i.block_id IS NOT NULL
          GROUP BY i.block_id
        ),
        answer_counts AS (
          SELECT
            i.block_id,
            COUNT(*) FILTER (WHERE ${gradedSql} = 'A')::int AS a,
            COUNT(*) FILTER (WHERE ${gradedSql} = 'B')::int AS b,
            COUNT(*) FILTER (WHERE ${gradedSql} = 'C')::int AS c,
            COUNT(*) FILTER (WHERE ${gradedSql} = 'D')::int AS d,
            COUNT(DISTINCT i.id) FILTER (WHERE ${gradedSql} IN ('A','B','C','D'))::int AS graded_inspections
          FROM inspection_answers ia
          INNER JOIN inspections i ON i.id = ia.inspection_id
          WHERE ${whereSql}
            AND lower(trim(COALESCE(ia.question_type, ''))) = 'graded'
            AND i.block_id IS NOT NULL
          GROUP BY i.block_id
        ),
        inspection_scores AS (
          SELECT
            i.block_id,
            i.id,
            i.submitted_at,
            AVG(${scoreSql}) AS inspection_score
          FROM inspection_answers ia
          INNER JOIN inspections i ON i.id = ia.inspection_id
          WHERE ${whereSql}
            AND lower(trim(COALESCE(ia.question_type, ''))) = 'graded'
            AND i.block_id IS NOT NULL
          GROUP BY i.block_id, i.id, i.submitted_at
          HAVING COUNT(*) FILTER (WHERE ${scoreSql} IS NOT NULL) > 0
        ),
        latest_graded AS (
          SELECT DISTINCT ON (block_id)
            block_id,
            inspection_score AS latest_score,
            submitted_at AS latest_submitted_at
          FROM inspection_scores
          ORDER BY block_id, submitted_at DESC NULLS LAST, id DESC
        )
        SELECT
          COALESCE(ib.block_id::text, '') AS block_id,
          COALESCE(NULLIF(trim(b.name), ''), 'Unknown block') AS block_name,
          COALESCE(ac.graded_inspections, 0)::int AS graded_inspections,
          COALESCE(ac.a, 0)::int AS a,
          COALESCE(ac.b, 0)::int AS b,
          COALESCE(ac.c, 0)::int AS c,
          COALESCE(ac.d, 0)::int AS d,
          CASE
            WHEN COALESCE(ac.a, 0) + COALESCE(ac.b, 0) + COALESCE(ac.c, 0) + COALESCE(ac.d, 0) > 0
            THEN (
              4.0 * COALESCE(ac.a, 0)
              + 3.0 * COALESCE(ac.b, 0)
              + 2.0 * COALESCE(ac.c, 0)
              + 1.0 * COALESCE(ac.d, 0)
            ) / (COALESCE(ac.a, 0) + COALESCE(ac.b, 0) + COALESCE(ac.c, 0) + COALESCE(ac.d, 0))
            ELSE NULL
          END AS avg_score,
          lg.latest_score,
          COALESCE(lg.latest_submitted_at, ib.latest_inspection_at) AS latest_submitted_at
        FROM inspected_blocks ib
        LEFT JOIN blocks b ON b.id = ib.block_id
        LEFT JOIN answer_counts ac ON ac.block_id = ib.block_id
        LEFT JOIN latest_graded lg ON lg.block_id = ib.block_id
        ORDER BY avg_score ASC NULLS LAST, graded_inspections DESC, block_name`
}
