/**
 * Shared analytics aggregation for GET /api/analytics (JSON for the Analytics UI and CSV export).
 * Inspection filters align with dashboard rules; presets (week/month/quarter) resolve dates first.
 */

import { getNeonQuery, pgPublicTableExists } from '@/lib/db'
import { aliasInspectionWhereClause, buildInspectionWhereConditions, joinSqlAnd } from '@/lib/inspection-filters'
import { resolveAnalyticsPresetDates, resolveIssueActionDates } from '@/lib/analytics-date-presets'

const TEMPORARILY_DISABLE_ESTATE_SCOPING = true
const ANALYTICS_AREA_OPTIONS = ['North', 'East', 'Central', 'South', 'West']
const ANALYTICS_ROLE_OPTIONS = [
  { value: 'caretaker', label: 'Caretakers', workType: 'caretaker_scheduled' },
  { value: 'esm', label: 'ESMs', workType: 'esm_adhoc' },
  { value: 'housing_officer', label: 'Housing Officers', workType: 'housing_walkabout' },
]
const ANALYTICS_ROLE_LABELS = new Map(ANALYTICS_ROLE_OPTIONS.map((r) => [r.value, r.label]))
const ANALYTICS_ROLE_WORK_TYPES = new Map(ANALYTICS_ROLE_OPTIONS.map((r) => [r.value, r.workType]))

function normalizeAnalyticsRole(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (v === 'caretaker' || v === 'caretakers') return 'caretaker'
  if (v === 'esm' || v === 'estate_services_manager' || v === 'estate_services_managers') return 'esm'
  if (v === 'housing_officer' || v === 'housing_officers') return 'housing_officer'
  return 'all'
}

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

  const legacyCaretaker = (eff.get('caretaker') || 'all').trim()
  const selectedRole = normalizeAnalyticsRole(eff.get('personRole') || eff.get('role') || (legacyCaretaker !== 'all' ? 'caretaker' : 'all'))
  const selectedPerson = (eff.get('person') || legacyCaretaker || 'all').trim()
  if (selectedRole !== 'all') {
    eff.set('role', selectedRole)
  } else {
    eff.delete('role')
  }
  const filterAsAdmin = admin || selectedPerson !== 'all'
  if (selectedPerson !== 'all') {
    eff.set('inspector', selectedPerson)
  } else {
    eff.delete('inspector')
  }

  const issueCategory = (eff.get('issueCategory') || 'all').trim()
  const { issueDateFrom, issueDateTo } = resolveIssueActionDates(
    eff,
    eff.get('dateFrom') || '',
    eff.get('dateTo') || ''
  )

  const filterCompleted = buildAnalyticsFilterArgs(eff, filterAsAdmin, internalUser)
  const filterAll = buildAllScopeArgs(eff, filterAsAdmin, internalUser)
  const filterScheduledTiming = buildScheduledTimingArgs(eff, filterAsAdmin, internalUser)

  const [whereCompletedText, whereCompletedParams] = joinSqlAnd(
    buildInspectionWhereConditions(filterCompleted)
  )
  const [whereAllText, whereAllParams] = joinSqlAnd(buildInspectionWhereConditions(filterAll))
  const [whereScheduledTimingText, whereScheduledTimingParams] = joinSqlAnd(
    buildInspectionWhereConditions(filterScheduledTiming)
  )
  const whereCompletedInspectionAlias = aliasInspectionWhereClause(whereCompletedText, 'i')
  const whereAllInspectionAlias = aliasInspectionWhereClause(whereAllText, 'i')

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
        COALESCE(NULLIF(trim(p.name), ''), NULLIF(trim(inspector_name), ''), NULLIF(trim(inspector_id), ''), '(unknown)') AS inspector_name,
        COALESCE(NULLIF(trim(inspector_id), ''), '') AS inspector_id,
        COALESCE(NULLIF(trim(p.job_title), ''), NULLIF(trim(p.role), ''), '') AS role_label,
        COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
        COUNT(*)::int AS total
      FROM inspections i
      LEFT JOIN people p ON lower(trim(p.email)) = lower(trim(i.inspector_id))
      WHERE ${whereAllInspectionAlias}
      GROUP BY 1, 2, 3
      ORDER BY submitted DESC
      LIMIT 30`,
      whereAllParams
    )
  ).rows

  const personCompleted = (
    await run(
      `SELECT
        COALESCE(NULLIF(trim(p.name), ''), NULLIF(trim(inspector_name), ''), NULLIF(trim(inspector_id), ''), '(unknown)') AS person_label,
        COALESCE(NULLIF(trim(inspector_id), ''), '') AS person_id,
        COALESCE(NULLIF(trim(p.job_title), ''), NULLIF(trim(p.role), ''), '') AS role_label,
        COUNT(*)::int AS completed_count
      FROM inspections i
      LEFT JOIN people p ON lower(trim(p.email)) = lower(trim(i.inspector_id))
      WHERE ${whereCompletedInspectionAlias}
      GROUP BY 1, 2, 3
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

  let peopleOptions = []
  try {
    const peopleResult = await run(
      `SELECT DISTINCT ON (person_id)
         person_id,
         label,
         value,
         email,
         role,
         role_label,
         has_login
       FROM (
         SELECT
           p.id AS person_id,
           COALESCE(NULLIF(trim(p.name), ''), NULLIF(trim(p.email), ''), p.id) AS label,
           COALESCE(NULLIF(trim(u.email), ''), NULLIF(trim(p.email), ''), NULLIF(trim(u.clerk_user_id), ''), p.id) AS value,
           COALESCE(NULLIF(trim(p.email), ''), NULLIF(trim(u.email), '')) AS email,
           CASE
             WHEN lower(trim(COALESCE(p.job_title, p.role, ''))) IN ('caretaker', 'caretakers') THEN 'caretaker'
             WHEN lower(trim(COALESCE(p.job_title, p.role, ''))) IN ('estate services manager', 'estate service manager', 'esm', 'esms') THEN 'esm'
             WHEN lower(trim(COALESCE(p.job_title, p.role, ''))) IN ('housing officer', 'housing officers') THEN 'housing_officer'
             ELSE 'other'
           END AS role,
           COALESCE(NULLIF(trim(p.job_title), ''), NULLIF(trim(p.role), '')) AS role_label,
           (u.id IS NOT NULL) AS has_login
         FROM people p
         LEFT JOIN users u ON u.people_id = p.id OR lower(trim(u.email)) = lower(trim(p.email))
         WHERE COALESCE(p.active, true) IS TRUE
           AND p.category IS DISTINCT FROM 'issue_recipient'
           AND lower(trim(COALESCE(p.job_title, p.role, ''))) IN (
             'caretaker',
             'caretakers',
             'estate services manager',
             'estate service manager',
             'esm',
             'esms',
             'housing officer',
             'housing officers'
           )
       ) people
       WHERE value IS NOT NULL AND trim(value) <> ''
       ORDER BY person_id, has_login DESC, label`,
      []
    )
    peopleOptions = (peopleResult.rows || [])
      .map((p) => ({
        personId: p.person_id,
        value: p.value,
        label: p.label,
        email: p.email,
        role: normalizeAnalyticsRole(p.role),
        roleLabel: p.role_label || ANALYTICS_ROLE_LABELS.get(normalizeAnalyticsRole(p.role)) || 'Staff',
      }))
      .filter((p) => p.value && p.role !== 'all')
      .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))
  } catch (e) {
    console.warn('[analytics-payload] people filter options failed:', e?.message)
    peopleOptions = []
  }

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

  const fallbackGradedAnswersSource = `(
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
        i.submitted_at AS inspection_submitted_at,
        i.due_date AS inspection_due_date,
        i.created_at AS inspection_created_at,
        i.estate_id,
        e.name AS estate_name,
        i.block_id,
        b.name AS block_name,
        i.template_id,
        i.template_name,
        i.template_version_id,
        i.inspector_id,
        i.inspector_name,
        i.location_label,
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
    )
    SELECT
      base.inspection_answer_id,
      base.inspection_id,
      base.inspection_type,
      base.inspection_status,
      base.inspection_submitted_at,
      base.inspection_due_date,
      base.inspection_created_at,
      base.estate_id,
      base.estate_name,
      base.block_id,
      base.block_name,
      base.template_id,
      base.template_name,
      base.template_version_id,
      base.answer_section_id,
      tmpl.section_title,
      base.question_id,
      COALESCE(NULLIF(trim(tmpl.question_key_raw), ''), base.question_id) AS question_key,
      tmpl.question_text,
      base.answer_question_type,
      tmpl.template_question_type,
      tmpl.grading_scheme_id,
      tmpl.grading_scheme_name,
      base.stored_grade_value,
      base.inspector_id,
      base.inspector_name,
      base.location_label,
      false AS is_na_grade
    FROM base
    LEFT JOIN LATERAL (
      SELECT
        sec_elem ->> 'title' AS section_title,
        q_elem ->> 'question_text' AS question_text,
        q_elem ->> 'question_type' AS template_question_type,
        q_elem ->> 'grading_scheme_id' AS grading_scheme_id,
        q_elem ->> 'grading_scheme_name' AS grading_scheme_name,
        q_elem ->> 'question_key' AS question_key_raw
      FROM jsonb_array_elements(COALESCE(base.template_snapshot -> 'sections', '[]'::jsonb)) AS sec(sec_elem)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sec_elem -> 'questions', '[]'::jsonb)) AS q(q_elem)
      WHERE q_elem ->> 'id' = base.question_id
      LIMIT 1
    ) tmpl ON true
    WHERE
      lower(trim(COALESCE(tmpl.template_question_type, ''))) = 'graded'
      OR lower(trim(COALESCE(base.answer_question_type, ''))) = 'graded'
  )`

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
  let gradedScanWhere = `(v.inspection_submitted_at IS NOT NULL OR lower(trim(COALESCE(v.inspection_status, ''))) = 'submitted')
    AND (v.is_na_grade IS NOT TRUE)`
  const cdParams = []
  let n = 1
  const df = eff.get('dateFrom') || ''
  const dt = eff.get('dateTo') || ''
  if (df) {
    cdWhere += ` AND v.inspection_submitted_at >= $${n}::timestamptz`
    gradedScanWhere += ` AND v.inspection_submitted_at >= $${n}::timestamptz`
    cdParams.push(df)
    n += 1
  }
  if (dt) {
    cdWhere += ` AND v.inspection_submitted_at <= $${n}::timestamptz`
    gradedScanWhere += ` AND v.inspection_submitted_at <= $${n}::timestamptz`
    cdParams.push(dt.length <= 10 ? `${dt} 23:59:59` : dt)
    n += 1
  }
  if (gradeCat && gradeCat !== 'all') {
    cdWhere += ` AND lower(trim(COALESCE(v.grading_scheme_name, ''))) = lower(trim($${n}))`
    gradedScanWhere += ` AND lower(trim(COALESCE(v.grading_scheme_name, ''))) = lower(trim($${n}))`
    cdParams.push(gradeCat)
    n += 1
  }
  if (gradeBlockId && gradeBlockId !== 'all') {
    cdWhere += ` AND v.block_id = $${n}`
    gradedScanWhere += ` AND v.block_id = $${n}`
    cdParams.push(gradeBlockId)
    n += 1
  }
  if (gradeTemplate && gradeTemplate !== 'all') {
    cdWhere += ` AND trim(COALESCE(v.template_name, '')) = trim($${n})`
    gradedScanWhere += ` AND trim(COALESCE(v.template_name, '')) = trim($${n})`
    cdParams.push(gradeTemplate)
    n += 1
  }
  const typeF = (eff.get('type') || 'all').trim()
  if (typeF && typeF !== 'all') {
    cdWhere += ` AND v.inspection_type = $${n}`
    gradedScanWhere += ` AND v.inspection_type = $${n}`
    cdParams.push(typeF)
    n += 1
  }
  const selectedWorkType = ANALYTICS_ROLE_WORK_TYPES.get(selectedRole)
  if (selectedWorkType) {
    cdWhere += ` AND EXISTS (SELECT 1 FROM inspections i_role WHERE i_role.id = v.inspection_id AND i_role.work_type = $${n})`
    gradedScanWhere += ` AND EXISTS (SELECT 1 FROM inspections i_role WHERE i_role.id = v.inspection_id AND i_role.work_type = $${n})`
    cdParams.push(selectedWorkType)
    n += 1
  }
  if (selectedPerson && selectedPerson !== 'all') {
    cdWhere += ` AND lower(trim(COALESCE(v.inspector_id, ''))) = lower(trim($${n}))`
    gradedScanWhere += ` AND lower(trim(COALESCE(v.inspector_id, ''))) = lower(trim($${n}))`
    cdParams.push(selectedPerson)
    n += 1
  }

  const cdFrom = `FROM ${hasGradeView ? 'v_graded_inspection_answers_analytics' : fallbackGradedAnswersSource} v
           LEFT JOIN estates e ON e.id = v.estate_id`

  let cdWhereFull = cdWhere
  let gradedScanWhereFull = gradedScanWhere
  if (gradeArea && gradeArea !== 'all') {
    cdWhereFull += ` AND lower(trim(COALESCE(e.area, ''))) = lower(trim($${n}))`
    gradedScanWhereFull += ` AND lower(trim(COALESCE(e.area, ''))) = lower(trim($${n}))`
    cdParams.push(gradeArea)
    n += 1
  }

  try {
    const debugR = await run(
      `SELECT
         COUNT(DISTINCT v.inspection_id)::int AS inspections_scanned,
         COUNT(*)::int AS graded_answers_found,
         COUNT(*) FILTER (WHERE (${cdGradeExpr}) IN ('C', 'D'))::int AS cd_answers_found
       ${cdFrom}
       WHERE ${gradedScanWhereFull}`,
      cdParams
    )
    console.log('[analytics-payload] C/D grade source trace', {
      source: hasGradeView ? 'v_graded_inspection_answers_analytics' : 'inspection_answers_fallback',
      inspections_scanned: debugR.rows[0]?.inspections_scanned ?? 0,
      graded_answers_found: debugR.rows[0]?.graded_answers_found ?? 0,
      cd_answers_found: debugR.rows[0]?.cd_answers_found ?? 0,
    })

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
      personRole: selectedRole !== 'all' ? selectedRole : null,
      personRoleLabel: selectedRole !== 'all' ? ANALYTICS_ROLE_LABELS.get(selectedRole) : null,
      person: selectedPerson !== 'all' ? selectedPerson : null,
      issueCategory: issueCategory !== 'all' ? issueCategory : null,
      gradeCategory: (eff.get('gradeCategory') || 'all') !== 'all' ? eff.get('gradeCategory') : null,
      gradeBlockId: (eff.get('gradeBlockId') || 'all') !== 'all' ? eff.get('gradeBlockId') : null,
      gradeArea: (eff.get('gradeArea') || 'all') !== 'all' ? eff.get('gradeArea') : null,
      gradeTemplateName: (eff.get('gradeTemplateName') || 'all') !== 'all' ? eff.get('gradeTemplateName') : null,
    },
    filterOptions: {
      roles: ANALYTICS_ROLE_OPTIONS.map(({ value, label }) => ({ value, label })),
      people: peopleOptions,
      caretakers: peopleOptions.filter((p) => p.role === 'caretaker').map((p) => ({
        caretaker_id: p.value,
        caretaker_label: p.label,
      })),
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
        inspectorId: r.inspector_id,
        roleLabel: r.role_label,
        submitted: r.submitted,
        total: r.total,
        completionPct: r.total > 0 ? Math.round((100 * r.submitted) / r.total) : 0,
      })),
      personCompleted: personCompleted.map((r) => ({
        personLabel: r.person_label,
        personId: r.person_id,
        roleLabel: r.role_label,
        completedCount: r.completed_count,
      })),
      caretakerCompleted: personCompleted.map((r) => ({
        caretakerLabel: r.person_label,
        caretakerId: r.person_id,
        completedCount: r.completed_count,
      })),
    },
    gradeRisk,
  }

  return { body }
}
