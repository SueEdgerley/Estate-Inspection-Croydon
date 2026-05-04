/**
 * Shared analytics aggregation for GET /api/analytics (JSON for the Analytics UI and CSV export).
 * Inspection filters align with dashboard rules; presets (week/month/quarter) resolve dates first.
 */

import { getNeonQuery, pgPublicTableExists } from '@/lib/db'
import { buildInspectionWhereConditions, joinSqlAnd } from '@/lib/inspection-filters'
import { resolveAnalyticsPresetDates, resolveIssueActionDates } from '@/lib/analytics-date-presets'

const TEMPORARILY_DISABLE_ESTATE_SCOPING = true
const ANALYTICS_AREA_OPTIONS = ['North', 'East', 'Central', 'South', 'West']

/**
 * @param {URLSearchParams} searchParams
 * @param {boolean} admin
 * @param {{ email?: string | null }} [internalUser]
 */
export function buildAnalyticsFilterArgs(searchParams, admin, internalUser) {
  return {
    completionScope: 'completed',
    dateField: 'submitted_at',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
    type: searchParams.get('type') || 'all',
    template: searchParams.get('template') || 'all',
    workType: searchParams.get('workType') || 'all',
    role: searchParams.get('role') || 'all',
    estateId: searchParams.get('estateId') || '',
    blockId: searchParams.get('blockId') || '',
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

function buildScheduledTimingArgs(searchParams, admin, internalUser) {
  return {
    ...buildAnalyticsFilterArgs(searchParams, admin, internalUser),
    completionScope: 'all',
    dateField: 'due_date',
    scheduled: 'all',
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

function buildActionFilterSql(whereCompletedText, whereCompletedParams, issueDateFrom, issueDateTo, issueCategory) {
  let w = `a.inspection_id IN (SELECT id FROM inspections WHERE ${whereCompletedText})`
  const p = [...whereCompletedParams]
  if (issueDateFrom) {
    w += ` AND a.created_at >= $${p.length + 1}::date`
    p.push(issueDateFrom)
  }
  if (issueDateTo) {
    const end = issueDateTo.length <= 10 ? `${issueDateTo} 23:59:59` : issueDateTo
    w += ` AND a.created_at <= $${p.length + 1}::timestamptz`
    p.push(end)
  }
  if (issueCategory && issueCategory !== 'all') {
    w += ` AND a.category = $${p.length + 1}`
    p.push(issueCategory)
  }
  return [w, p]
}

/**
 * @param {{ searchParams: URLSearchParams, admin: boolean, internalUser: object }} ctx
 * @returns {Promise<{ message?: string, body: object }>}
 */
export async function loadAnalyticsPayload({ searchParams, admin, internalUser }) {
  const eff = new URLSearchParams(searchParams.toString())
  const presetDates = resolveAnalyticsPresetDates(eff)
  if (presetDates.preset !== 'custom') {
    if (presetDates.dateFrom) eff.set('dateFrom', presetDates.dateFrom)
    if (presetDates.dateTo) eff.set('dateTo', presetDates.dateTo)
  }

  const caretaker = (eff.get('caretaker') || 'all').trim()
  if (caretaker !== 'all' && admin) {
    eff.set('inspector', caretaker)
  }

  const issueCategory = (eff.get('issueCategory') || 'all').trim()
  const { issueDateFrom, issueDateTo } = resolveIssueActionDates(
    eff,
    eff.get('dateFrom') || '',
    eff.get('dateTo') || ''
  )

  const filterCompleted = buildAnalyticsFilterArgs(eff, admin, internalUser)
  const filterAll = buildAllScopeArgs(eff, admin, internalUser)
  const filterScheduledTiming = buildScheduledTimingArgs(eff, admin, internalUser)

  const [whereCompletedText, whereCompletedParams] = joinSqlAnd(
    buildInspectionWhereConditions(filterCompleted)
  )
  const [whereAllText, whereAllParams] = joinSqlAnd(buildInspectionWhereConditions(filterAll))
  const [whereScheduledTimingText, whereScheduledTimingParams] = joinSqlAnd(
    buildInspectionWhereConditions(filterScheduledTiming)
  )

  const [actionWhere, actionParams] = buildActionFilterSql(
    whereCompletedText,
    whereCompletedParams,
    issueDateFrom,
    issueDateTo,
    issueCategory
  )

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

  const operationalRow = await run(
    `SELECT
      COUNT(*) FILTER (WHERE work_type = 'caretaker_scheduled')::int AS scheduled_total,
      COUNT(*) FILTER (
        WHERE work_type = 'caretaker_scheduled' AND status = 'submitted'
      )::int AS scheduled_completed,
      COUNT(*) FILTER (
        WHERE work_type = 'caretaker_scheduled' AND status IS DISTINCT FROM 'submitted'
      )::int AS scheduled_missed,
      COUNT(*) FILTER (WHERE work_type = 'esm_adhoc')::int AS adhoc_total,
      COUNT(*) FILTER (
        WHERE work_type = 'esm_adhoc' AND status = 'submitted'
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

  const scheduledOnlyPredicate = `(is_scheduled = true OR work_type = 'caretaker_scheduled')`
  const scheduledTimingRow = await run(
    `SELECT
      COUNT(*)::int AS total_scheduled,
      COUNT(*) FILTER (
        WHERE status = 'submitted'
          AND submitted_at IS NOT NULL
          AND due_date IS NOT NULL
          AND submitted_at::date <= due_date::date
      )::int AS completed_on_time,
      COUNT(*) FILTER (
        WHERE status = 'submitted'
          AND submitted_at IS NOT NULL
          AND (due_date IS NULL OR submitted_at::date > due_date::date)
      )::int AS completed_late,
      COUNT(*) FILTER (
        WHERE status IS DISTINCT FROM 'submitted' OR submitted_at IS NULL
      )::int AS missed
    FROM inspections
    WHERE ${whereScheduledTimingText}
      AND ${scheduledOnlyPredicate}`,
    whereScheduledTimingParams
  )
  const scheduledTimingSummary = scheduledTimingRow.rows[0] || {}
  const scheduledTimingRows = (
    await run(
      `SELECT
        x.id,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), x.location_label, x.title, 'Unknown') AS estate_block,
        COALESCE(NULLIF(trim(x.template_name), ''), NULLIF(trim(x.type), ''), 'Inspection') AS inspection_type,
        x.due_date::text AS scheduled_date,
        x.submitted_at::text AS completed_date,
        CASE
          WHEN x.status IS DISTINCT FROM 'submitted' OR x.submitted_at IS NULL THEN 'missed'
          WHEN x.due_date IS NOT NULL AND x.submitted_at::date <= x.due_date::date THEN 'on_time'
          ELSE 'late'
        END AS timing_status
      FROM (
        SELECT *
        FROM inspections
        WHERE ${whereScheduledTimingText}
          AND ${scheduledOnlyPredicate}
      ) x
      LEFT JOIN estates e ON e.id = x.estate_id
      LEFT JOIN blocks b ON b.id = x.block_id
      ORDER BY x.due_date DESC NULLS LAST, x.submitted_at DESC NULLS LAST, x.created_at DESC
      LIMIT 80`,
      whereScheduledTimingParams
    )
  ).rows

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
  let hotBlocks = []
  const hasActions = await pgPublicTableExists('actions')
  if (hasActions) {
    issueCategories = (
      await run(
        `SELECT a.category, COUNT(*)::int AS cnt
         FROM actions a
         WHERE ${actionWhere}
         GROUP BY a.category
         ORDER BY cnt DESC
         LIMIT 15`,
        actionParams
      )
    ).rows

    topIssueTitles = (
      await run(
        `SELECT COALESCE(NULLIF(trim(a.title), ''), '(no title)') AS title, COUNT(*)::int AS cnt
         FROM actions a
         WHERE ${actionWhere}
         GROUP BY 1
         ORDER BY cnt DESC
         LIMIT 15`,
        actionParams
      )
    ).rows

    issueHotspots = (
      await run(
        `SELECT
           COALESCE(
             NULLIF(CONCAT_WS(' / ', NULLIF(trim(e.name), ''), NULLIF(trim(b.name), '')), ''),
             NULLIF(trim(a.location), ''),
             CASE
               WHEN lower(trim(COALESCE(i.location_label, ''))) IN (
                 lower(trim(COALESCE(i.template_name, ''))),
                 lower(trim(COALESCE(i.type, ''))),
                 lower(trim(COALESCE(i.title, '')))
               ) THEN NULL
               ELSE NULLIF(trim(i.location_label), '')
             END,
             'Unknown location'
           ) AS location_label,
           COUNT(a.id)::int AS issue_count
         FROM actions a
         INNER JOIN inspections i ON i.id = a.inspection_id
         LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
         LEFT JOIN estates e ON e.id = COALESCE(b.estate_id, i.estate_id)
         WHERE ${actionWhere}
         GROUP BY 1
         ORDER BY issue_count DESC
         LIMIT 15`,
        actionParams
      )
    ).rows

    hotBlocks = (
      await run(
        `SELECT
           COALESCE(b.id::text, '') AS block_id,
           COALESCE(b.name, 'Unknown block') AS block_name,
           COALESCE(e.name, '') AS estate_name,
           COUNT(a.id)::int AS issue_count
         FROM actions a
         INNER JOIN inspections i ON i.id = a.inspection_id
         LEFT JOIN blocks b ON b.id = i.block_id
         LEFT JOIN estates e ON e.id = COALESCE(b.estate_id, i.estate_id)
         WHERE ${actionWhere}
         GROUP BY b.id, b.name, e.name
         ORDER BY issue_count DESC
         LIMIT 25`,
        actionParams
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

  const caretakerCompleted = (
    await run(
      `SELECT
        COALESCE(NULLIF(trim(inspector_name), ''), '(unknown)') AS caretaker_label,
        COALESCE(NULLIF(trim(inspector_id), ''), '') AS caretaker_id,
        COUNT(*)::int AS completed_count
      FROM inspections
      WHERE ${whereCompletedText}
      GROUP BY 1, 2
      ORDER BY completed_count DESC
      LIMIT 40`,
      whereCompletedParams
    )
  ).rows

  let issueCategoryOptions = []
  if (hasActions) {
    const catR = await run(
      `SELECT DISTINCT a.category AS category
       FROM actions a
       WHERE a.category IS NOT NULL AND trim(a.category) <> ''
       ORDER BY 1
       LIMIT 80`,
      []
    )
    issueCategoryOptions = (catR.rows || []).map((r) => r.category).filter(Boolean)
  }

  let caretakerOptions = []
  const inspOpt = await run(
    `SELECT DISTINCT
       COALESCE(NULLIF(trim(inspector_id), ''), '') AS caretaker_id,
       COALESCE(NULLIF(trim(inspector_name), ''), '(unknown)') AS caretaker_label
     FROM inspections
     WHERE status = 'submitted'
       AND (inspector_id IS NOT NULL OR inspector_name IS NOT NULL)
     ORDER BY caretaker_label
     LIMIT 200`,
    []
  )
  caretakerOptions = inspOpt.rows || []

  let blockOptions = []
  let areaOptions = ANALYTICS_AREA_OPTIONS
  let templateNameOptions = []
  try {
    const bR = await run(
      `SELECT id, name FROM blocks WHERE active IS DISTINCT FROM FALSE ORDER BY name LIMIT 400`,
      []
    )
    blockOptions = bR.rows || []
  } catch {
    blockOptions = []
  }
  areaOptions = ANALYTICS_AREA_OPTIONS
  try {
    const tR = await run(
      `SELECT DISTINCT TRIM(template_name) AS template_name
       FROM inspections
       WHERE NULLIF(trim(template_name), '') IS NOT NULL
       ORDER BY 1
       LIMIT 120`,
      []
    )
    templateNameOptions = (tR.rows || []).map((r) => r.template_name).filter(Boolean)
  } catch {
    templateNameOptions = []
  }

  let gradeRisk = null
  let hasGradeView = false
  const viewCheck = await run(
    `SELECT to_regclass('public.v_graded_inspection_answers_analytics') AS reg`,
    []
  )
  hasGradeView = Boolean(viewCheck.rows[0]?.reg)
  if (hasGradeView) {
    const gradeCat = (eff.get('gradeCategory') || 'all').trim()
    const gradeBlockId = (eff.get('gradeBlockId') || 'all').trim()
    const gradeArea = (eff.get('gradeArea') || 'all').trim()
    const gradeTemplate = (eff.get('gradeTemplateName') || 'all').trim()

    const cdGradeExpr = `CASE
      WHEN upper(trim(COALESCE(v.stored_grade_value, ''))) IN ('C', 'D')
        THEN upper(trim(COALESCE(v.stored_grade_value, '')))
      WHEN upper(trim(COALESCE(v.stored_grade_value, ''))) ~ '(^|[^A-Z])GRADE[[:space:]_-]*C([^A-Z]|$)' THEN 'C'
      WHEN upper(trim(COALESCE(v.stored_grade_value, ''))) ~ '(^|[^A-Z])GRADE[[:space:]_-]*D([^A-Z]|$)' THEN 'D'
      WHEN upper(trim(COALESCE(v.stored_grade_value, ''))) ~ '(^|[^A-Z])C([^A-Z]|$)' THEN 'C'
      WHEN upper(trim(COALESCE(v.stored_grade_value, ''))) ~ '(^|[^A-Z])D([^A-Z]|$)' THEN 'D'
      ELSE NULL
    END`
    let cdWhere = `(v.inspection_submitted_at IS NOT NULL OR lower(trim(COALESCE(v.inspection_status, ''))) = 'submitted')
      AND (${cdGradeExpr}) IN ('C', 'D')
      AND (v.is_na_grade IS NOT TRUE)`
    const cdParams = []
    let n = 1
    const df = eff.get('dateFrom') || ''
    const dt = eff.get('dateTo') || ''
    if (df) {
      cdWhere += ` AND v.inspection_submitted_at >= $${n++}::timestamptz`
      cdParams.push(df)
    }
    if (dt) {
      cdWhere += ` AND v.inspection_submitted_at <= $${n++}::timestamptz`
      cdParams.push(dt.length <= 10 ? `${dt} 23:59:59` : dt)
    }
    if (gradeCat && gradeCat !== 'all') {
      cdWhere += ` AND lower(trim(COALESCE(v.grading_scheme_name, ''))) = lower(trim($${n++}))`
      cdParams.push(gradeCat)
    }
    if (gradeBlockId && gradeBlockId !== 'all') {
      cdWhere += ` AND v.block_id = $${n++}`
      cdParams.push(gradeBlockId)
    }
    if (gradeTemplate && gradeTemplate !== 'all') {
      cdWhere += ` AND trim(COALESCE(v.template_name, '')) = trim($${n++})`
      cdParams.push(gradeTemplate)
    }
    const typeF = (eff.get('type') || 'all').trim()
    if (typeF && typeF !== 'all') {
      cdWhere += ` AND v.inspection_type = $${n++}`
      cdParams.push(typeF)
    }

    const cdFrom =
      gradeArea && gradeArea !== 'all'
        ? `FROM v_graded_inspection_answers_analytics v
           LEFT JOIN estates e ON e.id = v.estate_id`
        : `FROM v_graded_inspection_answers_analytics v
           LEFT JOIN estates e ON e.id = v.estate_id`

    let cdWhereFull = cdWhere
    if (gradeArea && gradeArea !== 'all') {
      cdWhereFull += ` AND lower(trim(COALESCE(e.area, ''))) = lower(trim($${n++}))`
      cdParams.push(gradeArea)
    }

    try {
      const sumR = await run(
        `SELECT
           COUNT(*)::int AS cd_answer_count,
           COUNT(DISTINCT v.block_id) FILTER (WHERE v.block_id IS NOT NULL)::int AS distinct_blocks,
           COUNT(DISTINCT v.estate_id) FILTER (WHERE v.estate_id IS NOT NULL)::int AS distinct_estates
         ${cdFrom}
         WHERE ${cdWhereFull}`,
        cdParams
      )
      const byMonthR = await run(
        `SELECT
           date_trunc('month', v.inspection_submitted_at AT TIME ZONE 'UTC')::date AS month_start,
           COUNT(*)::int AS cd_count
         ${cdFrom}
         WHERE ${cdWhereFull}
         GROUP BY 1
         ORDER BY 1 ASC
         LIMIT 36`,
        cdParams
      )
      const bySchemeR = await run(
        `SELECT COALESCE(NULLIF(trim(v.grading_scheme_name), ''), '(uncategorised)') AS grading_scheme_name,
                COUNT(*)::int AS cnt
         ${cdFrom}
         WHERE ${cdWhereFull}
         GROUP BY 1
         ORDER BY cnt DESC
         LIMIT 20`,
        cdParams
      )
      const topBlocksR = await run(
        `SELECT
                COALESCE(
                  NULLIF(CONCAT_WS(' / ', NULLIF(trim(v.estate_name), ''), NULLIF(trim(v.block_name), '')), ''),
                  NULLIF(trim(v.location_label), ''),
                  'Unknown location'
                ) AS location_label,
                COALESCE(NULLIF(trim(v.block_name), ''), '') AS block_name,
                COALESCE(NULLIF(trim(v.estate_name), ''), '') AS estate_name,
                COALESCE(NULLIF(trim(e.area), ''), '') AS area,
                COALESCE(NULLIF(trim(v.template_name), ''), NULLIF(trim(v.inspection_type), ''), 'Unknown form') AS form_name,
                COUNT(*) FILTER (WHERE (${cdGradeExpr}) = 'C')::int AS c_count,
                COUNT(*) FILTER (WHERE (${cdGradeExpr}) = 'D')::int AS d_count,
                COUNT(*)::int AS total_cd
         ${cdFrom}
         WHERE ${cdWhereFull}
         GROUP BY 1, 2, 3, 4, 5
         ORDER BY total_cd DESC, d_count DESC, c_count DESC
         LIMIT 20`,
        cdParams
      )
      const byLocationCategoryR = await run(
        `SELECT
                COALESCE(
                  NULLIF(CONCAT_WS(' / ', NULLIF(trim(v.estate_name), ''), NULLIF(trim(v.block_name), '')), ''),
                  NULLIF(trim(v.location_label), ''),
                  'Unknown location'
                ) AS location_label,
                COALESCE(NULLIF(trim(e.area), ''), '') AS area,
                COALESCE(NULLIF(trim(v.template_name), ''), NULLIF(trim(v.inspection_type), ''), 'Unknown form') AS form_name,
                COALESCE(
                  NULLIF(trim(v.section_title), ''),
                  NULLIF(trim(v.grading_scheme_name), ''),
                  NULLIF(trim(v.question_text), ''),
                  '(uncategorised)'
                ) AS category,
                COUNT(*) FILTER (WHERE (${cdGradeExpr}) = 'C')::int AS c_count,
                COUNT(*) FILTER (WHERE (${cdGradeExpr}) = 'D')::int AS d_count,
                COUNT(*)::int AS total_cd
         ${cdFrom}
         WHERE ${cdWhereFull}
         GROUP BY 1, 2, 3, 4
         ORDER BY total_cd DESC, d_count DESC, c_count DESC, location_label ASC, category ASC
         LIMIT 60`,
        cdParams
      )
      const sampleR = await run(
        `SELECT v.inspection_id, v.template_name, v.block_name, v.estate_name,
                v.stored_grade_value, (${cdGradeExpr}) AS normalized_grade, v.grading_scheme_name, v.question_text,
                v.inspection_submitted_at::text AS inspection_submitted_at
         ${cdFrom}
         WHERE ${cdWhereFull}
         ORDER BY v.inspection_submitted_at DESC NULLS LAST
         LIMIT 40`,
        cdParams
      )

      const sr = sumR.rows[0] || {}
      gradeRisk = {
        cdAnswerCount: sr.cd_answer_count ?? 0,
        distinctBlocks: sr.distinct_blocks ?? 0,
        distinctEstates: sr.distinct_estates ?? 0,
        byMonth: byMonthR.rows || [],
        byScheme: bySchemeR.rows || [],
        topBlocks: topBlocksR.rows || [],
        byLocationCategory: byLocationCategoryR.rows || [],
        sampleRows: sampleR.rows || [],
      }
    } catch (e) {
      console.warn('[analytics-payload] grade risk query failed:', e?.message)
      gradeRisk = { error: e?.message || 'grade query failed' }
    }
  }

  let gradingSchemeOptions = []
  if (hasGradeView) {
    try {
      const gs = await run(
        `SELECT DISTINCT NULLIF(trim(grading_scheme_name), '') AS grading_scheme_name
         FROM v_graded_inspection_answers_analytics
         WHERE grading_scheme_name IS NOT NULL
         ORDER BY 1
         LIMIT 80`,
        []
      )
      gradingSchemeOptions = (gs.rows || []).map((r) => r.grading_scheme_name).filter(Boolean)
    } catch {
      gradingSchemeOptions = []
    }
  }

  const body = {
    applied: {
      preset: presetDates.preset,
      dateFrom: eff.get('dateFrom') || null,
      dateTo: eff.get('dateTo') || null,
      issueDateFrom: issueDateFrom || null,
      issueDateTo: issueDateTo || null,
      caretaker: caretaker !== 'all' ? caretaker : null,
      issueCategory: issueCategory !== 'all' ? issueCategory : null,
      gradeCategory: (eff.get('gradeCategory') || 'all') !== 'all' ? eff.get('gradeCategory') : null,
      gradeBlockId: (eff.get('gradeBlockId') || 'all') !== 'all' ? eff.get('gradeBlockId') : null,
      gradeArea: (eff.get('gradeArea') || 'all') !== 'all' ? eff.get('gradeArea') : null,
      gradeTemplateName: (eff.get('gradeTemplateName') || 'all') !== 'all' ? eff.get('gradeTemplateName') : null,
    },
    filterOptions: {
      caretakers: caretakerOptions,
      issueCategories: issueCategoryOptions,
      gradingSchemes: gradingSchemeOptions,
      blocks: blockOptions,
      areas: areaOptions,
      templateNames: templateNameOptions,
    },
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
      scheduledTiming: {
        totalScheduled: scheduledTimingSummary.total_scheduled ?? 0,
        completedOnTime: scheduledTimingSummary.completed_on_time ?? 0,
        completedLate: scheduledTimingSummary.completed_late ?? 0,
        missed: scheduledTimingSummary.missed ?? 0,
        rows: scheduledTimingRows || [],
      },
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
          hotBlocks,
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
      caretakerCompleted: caretakerCompleted.map((r) => ({
        caretakerLabel: r.caretaker_label,
        caretakerId: r.caretaker_id,
        completedCount: r.completed_count,
      })),
    },
    gradeRisk,
  }

  return { body }
}
