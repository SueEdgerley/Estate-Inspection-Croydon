import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl, getNeonQuery, pgPublicTableExists } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { getCurrentUserEmail, getCurrentUserName } from '@/lib/auth'
import { buildInspectionWhereConditions, joinSqlAnd } from '@/lib/inspection-filters'

const ALLOWED_DASHBOARD_ROLES = ['owner', 'admin']
const TEMPORARILY_DISABLE_ESTATE_SCOPING = true

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isUsersTableMissing(err) {
  if (!err) return false
  const code = err.code
  const msg = (err.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('relation "users"')
}

function buildFilterArgs(searchParams, admin, internalUser) {
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
    ...buildFilterArgs(searchParams, admin, internalUser),
    completionScope: 'all',
  }
}

/** Map inspection.grading to 1–4 for averages; null if unknown / NA */
function gradeExpr(alias = '') {
  const p = alias ? `${alias}.` : ''
  return `CASE upper(trim(coalesce(${p}grading, '')))
    WHEN 'A' THEN 4
    WHEN 'B' THEN 3
    WHEN 'C' THEN 2
    WHEN 'D' THEN 1
    ELSE NULL END`
}

export async function GET(request) {
  const authResult = await auth()
  const clerkUserId = authResult?.userId ?? null
  let userEmail = null
  try {
    userEmail = await getCurrentUserEmail()
  } catch {
    /* ignore */
  }

  try {
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    await ensureDatabase()
    try {
      let displayName = null
      try {
        displayName = await getCurrentUserName()
      } catch {
        displayName = null
      }
      await ensureClerkUserProvisioned(clerkUserId, userEmail, { displayName })
    } catch (provErr) {
      if (isUsersTableMissing(provErr)) {
        return NextResponse.json(
          { error: 'DB not migrated', code: 'DB_NOT_MIGRATED' },
          { status: 500 }
        )
      }
    }

    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    let userResult
    try {
      userResult = await sql`SELECT id, clerk_user_id, email, role, COALESCE(is_active, true) AS is_active FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`
    } catch (e) {
      if (isUsersTableMissing(e)) {
        return NextResponse.json({ error: 'DB not migrated', code: 'DB_NOT_MIGRATED' }, { status: 500 })
      }
      throw e
    }

    const internalUser = userResult.rows[0] || null
    if (!internalUser) {
      return NextResponse.json({ error: 'User not provisioned', code: 'USER_NOT_PROVISIONED' }, { status: 403 })
    }
    if (internalUser.is_active === false) {
      return NextResponse.json({ error: 'User inactive', code: 'USER_INACTIVE' }, { status: 403 })
    }

    const role = (internalUser.role || '').toLowerCase().trim()
    if (!ALLOWED_DASHBOARD_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Access denied', code: 'ROLE_NOT_PERMITTED' }, { status: 403 })
    }

    const admin = role === 'admin' || role === 'owner'
    let assignedEstateCount = 0
    if (await pgPublicTableExists('user_estate_assignments')) {
      const countResult = await sql`SELECT COUNT(*)::int AS c FROM user_estate_assignments WHERE user_id = ${internalUser.id}`
      assignedEstateCount = countResult.rows[0]?.c ?? 0
    }

    if (!admin && assignedEstateCount === 0) {
      return NextResponse.json({
        overview: null,
        estates: [],
        blocks: [],
        issues: null,
        trends: null,
        performance: null,
        message: 'No estates assigned yet.',
      })
    }

    const { searchParams } = new URL(request.url)
    const filterCompleted = buildFilterArgs(searchParams, admin, internalUser)
    const filterAll = buildAllScopeArgs(searchParams, admin, internalUser)

    const [whereCompletedText, whereCompletedParams] = joinSqlAnd(
      buildInspectionWhereConditions(filterCompleted)
    )
    const [whereAllText, whereAllParams] = joinSqlAnd(buildInspectionWhereConditions(filterAll))

    const run = getNeonQuery()

    const [whereActiveText, whereActiveParams] = joinSqlAnd(
      buildInspectionWhereConditions({ ...filterCompleted, completionScope: 'active' })
    )

    // --- Overview: totals, score, completion rate, trend ---
    const overviewResult = await run(
      `SELECT
        COUNT(*)::int AS total_submitted,
        AVG(${gradeExpr()}) AS avg_grade,
        COUNT(*) FILTER (WHERE ${gradeExpr()} IS NOT NULL)::int AS graded_count
      FROM inspections
      WHERE ${whereCompletedText}`,
      whereCompletedParams
    )

    const activePipeline = await run(
      `SELECT COUNT(*)::int AS c FROM inspections WHERE ${whereActiveText}`,
      whereActiveParams
    )

    const totalAll = await run(
      `SELECT COUNT(*)::int AS c FROM inspections WHERE ${whereAllText}`,
      whereAllParams
    )

    const submitted = overviewResult.rows[0]?.total_submitted ?? 0
    const activeCount = activePipeline.rows[0]?.c ?? 0
    const allCount = totalAll.rows[0]?.c ?? 0
    const avgGrade = overviewResult.rows[0]?.avg_grade
    const gradedCount = overviewResult.rows[0]?.graded_count ?? 0

    const completionDenominator = submitted + activeCount
    const completionRatePct =
      completionDenominator > 0 ? Math.round((100 * submitted) / completionDenominator) : null

    const altCompletionPct = allCount > 0 ? Math.round((100 * submitted) / allCount) : null

    // Trend: last 90 days vs previous 90 days (submitted counts)
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
      const pct =
        prior > 0 ? Math.round(((recent - prior) / prior) * 100) : recent > 0 ? 100 : 0
      trendLabel =
        prior === 0 && recent > 0
          ? `Submitted inspections in the last 90 days: ${recent} (no prior period to compare).`
          : `Last 90 days vs previous 90 days: ${pct >= 0 ? '+' : ''}${pct}% change in volume (${recent} vs ${prior}).`
    }

    // --- Estates & blocks (subquery so WHERE fragments stay unqualified) ---
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

    // --- Actions / issues ---
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

    // --- Monthly trends (last 12 months) ---
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

    // --- Performance: per inspector ---
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

    return NextResponse.json({
      overview: {
        totalInspections: submitted,
        gradedInspections: gradedCount,
        overallScore: avgGrade != null ? Number(avgGrade) : null,
        overallScoreLabel:
          avgGrade != null ? `${Number(avgGrade).toFixed(2)} / 4.00 (A–D average)` : '—',
        completionRatePct: completionRatePct ?? altCompletionPct,
        completionBasis:
          completionDenominator > 0
            ? 'submitted vs submitted + in-progress'
            : allCount > 0
              ? 'submitted vs all matching filters'
              : null,
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
      },
      performance: {
        byInspector: byInspector.map((r) => ({
          inspectorName: r.inspector_name,
          submitted: r.submitted,
          total: r.total,
          completionPct: r.total > 0 ? Math.round((100 * r.submitted) / r.total) : 0,
        })),
      },
    })
  } catch (error) {
    console.error('[Analytics]', error)
    return NextResponse.json(
      { error: 'Failed to load analytics', details: error.message },
      { status: 500 }
    )
  }
}
