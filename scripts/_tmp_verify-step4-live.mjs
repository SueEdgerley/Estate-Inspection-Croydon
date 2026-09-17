/**
 * Live Step 4 verification against the current implementation helpers and database.
 * Not for commit — delete after reporting.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { resolveAnalyticsPresetDates, analyticsPresetLabel } from '../lib/analytics-date-presets.js'
import { gradedAbcdSql, rankAttentionBlocks, summariseAbcd, ATTENTION_BLOCK_MIN_GRADED } from '../lib/analytics-grade-summary.js'
import { analyticsFormBucketSql, aggregateInspectionsByForm } from '../lib/analytics-form-labels.js'
import { aggregateIssueThemes, isTechnicalOrFormIssueLabel } from '../lib/analytics-issue-themes.js'
import { buildManagementReport } from '../lib/analytics-management-report.js'
import { sqlExcludeFalseAutoActions, FALSE_ACTION_VOID_MARKER } from '../lib/false-action-cleanup.js'
import { buildActionFilterSql } from '../lib/analytics-payload.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const key = line.slice(0, i).trim()
  let value = line.slice(i + 1)
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = value
}

const preset = resolveAnalyticsPresetDates(new URLSearchParams({ preset: 'month' }))
const dateFrom = preset.dateFrom
const dateToEnd = `${preset.dateTo} 23:59:59`
const gradedSql = gradedAbcdSql('ia')
const formSql = analyticsFormBucketSql('i')
const submittedWhere = `i.status = 'submitted' AND i.submitted_at >= $1::timestamptz AND i.submitted_at <= $2::timestamptz`
const params = [dateFrom, dateToEnd]
const [actionWhere, actionParams] = buildActionFilterSql(submittedWhere, params, dateFrom, preset.dateTo)

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  const overview = await client.query(
    `SELECT COUNT(*)::int AS inspections_completed,
            COUNT(DISTINCT i.block_id) FILTER (WHERE i.block_id IS NOT NULL)::int AS blocks_inspected
     FROM inspections i WHERE ${submittedWhere}`,
    params
  )
  const gradesRow = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${gradedSql} = 'A')::int AS a,
       COUNT(*) FILTER (WHERE ${gradedSql} = 'B')::int AS b,
       COUNT(*) FILTER (WHERE ${gradedSql} = 'C')::int AS c,
       COUNT(*) FILTER (WHERE ${gradedSql} = 'D')::int AS d,
       COUNT(*) FILTER (WHERE ${gradedSql} = 'NA')::int AS na
     FROM inspection_answers ia
     INNER JOIN inspections i ON i.id = ia.inspection_id
     WHERE ${submittedWhere}
       AND lower(trim(COALESCE(ia.question_type,''))) = 'graded'`,
    params
  )
  const forms = await client.query(
    `SELECT ${formSql} AS form, COUNT(*)::int AS inspections
     FROM inspections i WHERE ${submittedWhere} GROUP BY 1`,
    params
  )
  const blocks = await client.query(
    `SELECT
       COALESCE(b.id::text, '') AS block_id,
       COALESCE(NULLIF(trim(b.name), ''), 'Unknown block') AS block_name,
       COUNT(*) FILTER (WHERE ${gradedSql} = 'C')::int AS c,
       COUNT(*) FILTER (WHERE ${gradedSql} = 'D')::int AS d,
       COUNT(*) FILTER (WHERE ${gradedSql} IN ('C','D'))::int AS cd,
       COUNT(*) FILTER (WHERE ${gradedSql} IN ('A','B','C','D'))::int AS graded_abcd
     FROM inspection_answers ia
     INNER JOIN inspections i ON i.id = ia.inspection_id
     LEFT JOIN blocks b ON b.id = i.block_id
     WHERE ${submittedWhere}
       AND lower(trim(COALESCE(ia.question_type,''))) = 'graded'
       AND i.block_id IS NOT NULL
     GROUP BY b.id, b.name
     HAVING COUNT(*) FILTER (WHERE ${gradedSql} IN ('A','B','C','D')) > 0`,
    params
  )
  const issues = await client.query(
    `SELECT a.category, a.question_id, a.section_name,
            COALESCE(NULLIF(trim(a.title), ''), '(no title)') AS title,
            COALESCE(NULLIF(trim(i.template_name), ''), '') AS template_name,
            COALESCE(NULLIF(trim(i.type), ''), '') AS inspection_type,
            COUNT(*)::int AS cnt
     FROM actions a
     INNER JOIN inspections i ON i.id = a.inspection_id
     WHERE ${actionWhere}
     GROUP BY 1,2,3,4,5,6`,
    actionParams
  )
  const rawCategories = await client.query(
    `SELECT a.category, COUNT(*)::int AS cnt
     FROM actions a
     INNER JOIN inspections i ON i.id = a.inspection_id
     WHERE ${actionWhere}
     GROUP BY 1
     ORDER BY cnt DESC`,
    actionParams
  )
  const falseCounts = await client.query(
    `SELECT
       COUNT(*)::int AS all_actions,
       COUNT(*) FILTER (WHERE ${sqlExcludeFalseAutoActions('a')})::int AS after_exclusion,
       COUNT(*) FILTER (WHERE strpos(COALESCE(a.repair_notes, ''), '${FALSE_ACTION_VOID_MARKER}') > 0)::int AS false_auto
     FROM actions a
     INNER JOIN inspections i ON i.id = a.inspection_id
     WHERE ${submittedWhere}
       AND a.created_at >= $1::date
       AND a.created_at <= $2::timestamptz`,
    params
  )

  const grades = summariseAbcd(gradesRow.rows[0])
  const topIssues = aggregateIssueThemes(issues.rows)
  const leaked = topIssues.filter((row) => isTechnicalOrFormIssueLabel(row.theme))
  const leakedRawStillMappedAway = (rawCategories.rows || [])
    .filter((row) => isTechnicalOrFormIssueLabel(row.category))
    .map((row) => ({ category: row.category, cnt: row.cnt }))

  const report = buildManagementReport({
    period: { ...preset, label: analyticsPresetLabel(preset.preset) },
    inspectionsCompleted: overview.rows[0].inspections_completed,
    blocksInspected: overview.rows[0].blocks_inspected,
    grades,
    topIssues,
    attentionBlocks: rankAttentionBlocks(blocks.rows, { minGraded: ATTENTION_BLOCK_MIN_GRADED, limit: 3 }),
    inspectionsByForm: aggregateInspectionsByForm(forms.rows),
  })

  console.log(JSON.stringify({
    actionFilterHasFalseMarker: actionWhere.includes(FALSE_ACTION_VOID_MARKER),
    minGraded: ATTENTION_BLOCK_MIN_GRADED,
    falseCounts: falseCounts.rows[0],
    leaked,
    leakedRawStillMappedAway,
    rawTopCategories: rawCategories.rows.slice(0, 8),
    report: {
      period: report.period,
      inspectionsCompleted: report.inspectionsCompleted,
      blocksInspected: report.blocksInspected,
      estatesInspected: report.estatesInspected,
      grades: report.grades,
      headlines: report.headlines,
      topIssues: report.topIssues,
      attentionBlocks: report.attentionBlocks,
      inspectionsByForm: report.inspectionsByForm,
    },
  }, null, 2))
} finally {
  await client.end()
}
