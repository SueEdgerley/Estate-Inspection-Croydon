/**
 * Shared analytics aggregation for /api/analytics and /api/analytics/report.
 * Same filters as the dashboard (buildInspectionWhereConditions).
 */

import { getNeonQuery, pgPublicTableExists } from '@/lib/db'
import { buildInspectionWhereConditions, joinSqlAnd } from '@/lib/inspection-filters'

const TEMPORARILY_DISABLE_ESTATE_SCOPING = true

export function buildAnalyticsFilterArgs(searchParams, admin, internalUser) {
  return {
    completionScope: 'completed',
    dateField: 'submitted_at',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
    type: searchParams.get('type') || 'all',
    template: searchParams.get('template') || 'all',
    inspector: searchParams.get('inspector') || 'all',
    scheduled: searchParams.get('scheduled') || 'all',
    grading: searchParams.get('grading') || 'all',
    admin,
    fallbackInspectorId: !TEMPORARILY_DISABLE_ESTATE_SCOPING ? internalUser?.email : null,
  }
}

function buildAllScopeArgs(searchParams, admin, internalUser) {
  return {
    ...buildAnalyticsFilterArgs(searchParams, admin, internalUser),
    completionScope: 'all',
  }
}

/** Map inspection.grading to 1–4 for averages; null if unknown / NA */
export function gradeExpr(alias = '') {
  const p = alias ? `${alias}.` : ''
  return `CASE upper(trim(coalesce(${p}grading, '')))
    WHEN 'A' THEN 4
    WHEN 'B' THEN 3
    WHEN 'C' THEN 2
    WHEN 'D' THEN 1
    ELSE NULL END`
}

/**
 * @param {{ searchParams: URLSearchParams, admin: boolean, internalUser: object }} ctx
 * @returns {Promise<{ message?: string, body: object }>}
 */
export async function loadAnalyticsPayload({ searchParams, admin, internalUser }) {
  const filterCompleted = buildAnalyticsFilterArgs(searchParams, admin, internalUser)
  const filterAll = buildAllScopeArgs(searchParams, admin, internalUser)

  const [whereCompletedText, whereCompletedParams] = joinSqlAnd(
    buildInspectionWhereConditions(filterCompleted)
  )
  const [whereAllText, whereAllParams] = joinSqlAnd(buildInspectionWhereConditions(filterAll))

  const run = getNeonQuery()

  const overviewResult = await run(
    `SELECT
        COUNT(*)::int AS total_submitted,
        AVG(${gradeExpr()}) AS avg_grade,
        COUNT(*) FILTER (WHERE ${gradeExpr()} IS NOT NULL)::int AS graded_count
      FROM inspections
      WHERE ${whereCompletedText}`,
    whereCompletedParams
  )

  const submitted = overviewResult.rows[0]?.total_submitted ?? 0
  const avgGrade = overviewResult.rows[0]?.avg_grade
  const gradedCount = overviewResult.rows[0]?.graded_count ?? 0

  /** Scheduled vs ad hoc vs completion (all rows matching filters, any status). */
  const operationalRow = await run(
    `SELECT
      COUNT(*) FILTER (WHERE COALESCE(is_scheduled, false) = true)::int AS scheduled_total,
      COUNT(*) FILTER (
        WHERE COALESCE(is_scheduled, false) = true AND status = 'submitted'
      )::int AS scheduled_completed,
      COUNT(*) FILTER (
        WHERE COALESCE(is_scheduled, false) = true AND status IS DISTINCT FROM 'submitted'
      )::int AS scheduled_missed,
      COUNT(*) FILTER (WHERE COALESCE(is_scheduled, false) = false)::int AS adhoc_total,
      COUNT(*) FILTER (
        WHERE COALESCE(is_scheduled, false) = false AND status = 'submitted'
      )::int AS adhoc_completed
    FROM inspections
    WHERE ${whereAllText}`,
    whereAllParams
  )
  const op = operationalRow.rows[0] || {}
  const scheduledTotal = op.scheduled_total ?? 0
  const scheduledCompleted = op.scheduled_completed ?? 0
  const scheduledMissed = op.scheduled_missed ?? 0
  const adhocTotal = op.adhoc_total ?? 0
  const adhocCompleted = op.adhoc_completed ?? 0

  const completionRatePct =
    scheduledTotal > 0 ? Math.round((100 * scheduledCompleted) / scheduledTotal) : null

  const trendResult = await run(
    `SELECT
        COUNT(*) FILTER (
          WHERE submitted_at >= NOW() - INTERVAL '90 days'
            AND submitted_at < NOW()
        )::int AS recent,
        COUNT(*) FILTER (
          WHERE submitted_at >= NOW() - INTERVAL '180 days'
            AND submitted_at < NOW() - INTERVAL '90 days'
        )::int AS prior
      FROM inspections
      WHERE ${whereCompletedText}`,
    whereCompletedParams
  )
  const recent = trendResult.rows[0]?.recent ?? 0
  const prior = trendResult.rows[0]?.prior ?? 0
  let trendDirection = 'flat'
  let trendLabel = 'Not enough history to compare periods yet.'
  if (prior > 0 || recent > 0) {
    if (recent > prior) trendDirection = 'up'
    else if (recent < prior) trendDirection = 'down'
    const pct = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : recent > 0 ? 100 : 0
    trendLabel =
      prior === 0 && recent > 0
        ? `Submitted inspections in the last 90 days: ${recent} (no prior period to compare).`
        : `Last 90 days vs previous 90 days: ${pct >= 0 ? '+' : ''}${pct}% change in volume (${recent} vs ${prior}).`
  }

  const estatesSafe = await run(
    `SELECT
        COALESCE(e.id, '') AS estate_id,
        COALESCE(e.name, 'Unknown / unassigned') AS estate_name,
        COUNT(x.id)::int AS inspection_count,
        AVG(${gradeExpr('x')}) AS avg_grade
      FROM (
        SELECT * FROM inspections WHERE ${whereCompletedText}
      ) x
      LEFT JOIN estates e ON e.id = x.estate_id
      GROUP BY e.id, e.name
      ORDER BY inspection_count DESC
      LIMIT 40`,
    whereCompletedParams
  )

  const blocksSafe = await run(
    `SELECT
        COALESCE(b.id, '') AS block_id,
        COALESCE(b.name, 'Unknown / unassigned') AS block_name,
        COALESCE(e.name, '') AS estate_name,
        COUNT(x.id)::int AS inspection_count,
        AVG(${gradeExpr('x')}) AS avg_grade
      FROM (
        SELECT * FROM inspections WHERE ${whereCompletedText}
      ) x
      LEFT JOIN blocks b ON b.id = x.block_id
      LEFT JOIN estates e ON e.id = b.estate_id
      GROUP BY b.id, b.name, e.name
      ORDER BY inspection_count DESC
      LIMIT 40`,
    whereCompletedParams
  )

  let issueCategories = []
  let topIssueTitles = []
  let issueHotspots = []
  const hasActions = await pgPublicTableExists('actions')
  if (hasActions) {
    issueCategories = (
      await run(
        `SELECT a.category, COUNT(*)::int AS cnt
         FROM actions a
         WHERE a.inspection_id IN (SELECT id FROM inspections WHERE ${whereCompletedText})
         GROUP BY a.category
         ORDER BY cnt DESC
         LIMIT 15`,
        whereCompletedParams
      )
    ).rows

    topIssueTitles = (
      await run(
        `SELECT COALESCE(NULLIF(trim(a.title), ''), '(no title)') AS title, COUNT(*)::int AS cnt
         FROM actions a
         WHERE a.inspection_id IN (SELECT id FROM inspections WHERE ${whereCompletedText})
         GROUP BY 1
         ORDER BY cnt DESC
         LIMIT 15`,
        whereCompletedParams
      )
    ).rows

    issueHotspots = (
      await run(
        `SELECT
           COALESCE(i.location_label, i.title, 'Unknown') AS location_label,
           COUNT(a.id)::int AS issue_count
         FROM actions a
         INNER JOIN inspections i ON i.id = a.inspection_id
         WHERE i.id IN (SELECT id FROM inspections WHERE ${whereCompletedText})
         GROUP BY 1
         ORDER BY issue_count DESC
         LIMIT 15`,
        whereCompletedParams
      )
    ).rows
  }

  const monthly = (
    await run(
      `SELECT
        date_trunc('month', submitted_at AT TIME ZONE 'UTC')::date AS month_start,
        COUNT(*)::int AS inspection_count,
        AVG(${gradeExpr()}) AS avg_grade
      FROM inspections
      WHERE ${whereCompletedText}
        AND submitted_at >= NOW() - INTERVAL '14 months'
      GROUP BY 1
      ORDER BY 1 ASC`,
      whereCompletedParams
    )
  ).rows

  const weeklyCompleted = (
    await run(
      `SELECT
        date_trunc('week', submitted_at AT TIME ZONE 'UTC')::date AS week_start,
        COUNT(*)::int AS inspection_count
      FROM inspections
      WHERE ${whereCompletedText}
        AND submitted_at >= NOW() - INTERVAL '20 weeks'
      GROUP BY 1
      ORDER BY 1 ASC`,
      whereCompletedParams
    )
  ).rows

  const byInspector = (
    await run(
      `SELECT
        COALESCE(NULLIF(trim(inspector_name), ''), '(unknown)') AS inspector_name,
        COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
        COUNT(*)::int AS total
      FROM inspections
      WHERE ${whereAllText}
      GROUP BY 1
      ORDER BY submitted DESC
      LIMIT 30`,
      whereAllParams
    )
  ).rows

  const body = {
    overview: {
      totalInspections: submitted,
      completedInspections: submitted,
      gradedInspections: gradedCount,
      overallScore: avgGrade != null ? Number(avgGrade) : null,
      overallScoreLabel:
        avgGrade != null ? `${Number(avgGrade).toFixed(2)} / 4.00 (A–D average)` : '—',
      completionRatePct,
      completionBasis:
        scheduledTotal > 0
          ? 'Completed scheduled ÷ Scheduled (same filters)'
          : 'No scheduled inspections in this filter',
      scheduledTotal,
      scheduledCompleted,
      scheduledMissed,
      adhocTotal,
      adhocCompleted,
      trend: {
        direction: trendDirection,
        label: trendLabel,
        recent90d: recent,
        prior90d: prior,
      },
    },
    estates: estatesSafe.rows,
    blocks: blocksSafe.rows,
    issues: hasActions
      ? {
          categories: issueCategories,
          topTitles: topIssueTitles,
          hotspots: issueHotspots,
        }
      : null,
    trends: {
      scoresByMonth: monthly,
      volumeByMonth: monthly.map((m) => ({
        month_start: m.month_start,
        inspection_count: m.inspection_count,
      })),
      volumeByWeek: weeklyCompleted.map((w) => ({
        week_start: w.week_start,
        inspection_count: w.inspection_count,
      })),
    },
    performance: {
      byInspector: byInspector.map((r) => ({
        inspectorName: r.inspector_name,
        submitted: r.submitted,
        total: r.total,
        completionPct: r.total > 0 ? Math.round((100 * r.submitted) / r.total) : 0,
      })),
    },
  }

  return { body }
}
