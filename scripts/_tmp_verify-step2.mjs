/**
 * Read-only Step 2 verification. Does not INSERT or nextval().
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { sqlExcludeFalseAutoActions, FALSE_ACTION_VOID_MARKER } from '../lib/false-action-cleanup.js'
import { parseIssueReferenceQuery, formatIssueReference } from '../lib/issue-number.js'
import { buildActionListWhere, normalizeActionListStatus } from '../lib/action-list-filters.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const envPath = path.join(root, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadEnv()
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const genuine = sqlExcludeFalseAutoActions('a')
    const falseMarked = `strpos(COALESCE(a.repair_notes, ''), '${FALSE_ACTION_VOID_MARKER}') > 0`
    const active = `lower(trim(COALESCE(a.status, ''))) IN ('open', 'in_progress', 'in progress')`

    const counts = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ${genuine})::int AS genuine,
         COUNT(*) FILTER (WHERE ${falseMarked})::int AS false_marked,
         COUNT(*) FILTER (WHERE ${genuine} AND a.issue_number IS NOT NULL)::int AS genuine_numbered,
         COUNT(*) FILTER (WHERE ${genuine} AND a.issue_number IS NULL)::int AS genuine_unnumbered,
         COUNT(*) FILTER (WHERE ${falseMarked} AND a.issue_number IS NULL)::int AS false_unnumbered,
         COUNT(*) FILTER (WHERE ${falseMarked} AND a.issue_number IS NOT NULL)::int AS false_numbered,
         COUNT(*) FILTER (WHERE ${genuine} AND ${active})::int AS genuine_active,
         COUNT(*) FILTER (WHERE ${genuine} AND ${active} AND a.issue_number IS NOT NULL)::int AS genuine_active_numbered,
         COUNT(*) FILTER (WHERE ${genuine} AND lower(trim(COALESCE(a.status,''))) = 'completed')::int AS genuine_completed,
         COUNT(*) FILTER (WHERE ${genuine} AND lower(trim(COALESCE(a.status,''))) = 'closed')::int AS genuine_closed,
         COUNT(DISTINCT a.issue_number)::int AS distinct_numbers,
         COALESCE(MIN(a.issue_number), 0)::int AS min_number,
         COALESCE(MAX(a.issue_number), 0)::int AS max_number
       FROM actions a`
    )

    const dupes = await client.query(
      `SELECT issue_number, COUNT(*)::int AS c
       FROM actions
       WHERE issue_number IS NOT NULL
       GROUP BY issue_number
       HAVING COUNT(*) > 1`
    )

    const gaps = await client.query(
      `SELECT gs AS missing
       FROM generate_series(1, 993) gs
       LEFT JOIN actions a ON a.issue_number = gs
       WHERE a.id IS NULL`
    )

    const seq = await client.query(
      `SELECT last_value, is_called FROM actions_issue_number_seq`
    )
    const def = await client.query(
      `SELECT column_default
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'actions'
         AND column_name = 'issue_number'`
    )

    const activeWhere = buildActionListWhere({ status: 'active', startIndex: 1 })
    const allWhere = buildActionListWhere({ status: 'all', startIndex: 1 })
    const allWithFalse = buildActionListWhere({ status: 'all', startIndex: 1, includeFalseActions: true })
    const closedWhere = buildActionListWhere({ status: 'closed', startIndex: 1 })

    const activeCount = await client.query(
      `SELECT COUNT(DISTINCT a.id)::int AS total FROM actions a WHERE ${activeWhere.sql}`,
      activeWhere.params
    )
    const allCount = await client.query(
      `SELECT COUNT(DISTINCT a.id)::int AS total FROM actions a WHERE ${allWhere.sql}`,
      allWhere.params
    )
    const allWithFalseCount = await client.query(
      `SELECT COUNT(DISTINCT a.id)::int AS total FROM actions a WHERE ${allWithFalse.sql}`,
      allWithFalse.params
    )
    const closedCount = await client.query(
      `SELECT COUNT(DISTINCT a.id)::int AS total FROM actions a WHERE ${closedWhere.sql}`,
      closedWhere.params
    )

    const search123 = buildActionListWhere({ status: 'all', search: 'ISS-000123', startIndex: 1 })
    const searchShort = buildActionListWhere({ status: 'all', search: 'ISS-123', startIndex: 1 })
    const searchNum = buildActionListWhere({ status: 'all', search: '123', startIndex: 1 })
    const hit123 = await client.query(
      `SELECT a.id, a.issue_number FROM actions a WHERE ${search123.sql}`,
      search123.params
    )
    const hitShort = await client.query(
      `SELECT a.id, a.issue_number FROM actions a WHERE ${searchShort.sql}`,
      searchShort.params
    )
    const hitNum = await client.query(
      `SELECT a.id, a.issue_number FROM actions a WHERE ${searchNum.sql}`,
      searchNum.params
    )

    const nextNumber = seq.rows[0]?.is_called ? Number(seq.rows[0].last_value) + 1 : Number(seq.rows[0].last_value)

    const payload = {
      counts: counts.rows[0],
      duplicates: dupes.rows,
      missing_1_to_993: gaps.rows.map((row) => row.missing),
      sequence: seq.rows[0],
      next_issue_number_without_insert: nextNumber,
      next_reference: formatIssueReference(nextNumber),
      column_default: def.rows[0]?.column_default || null,
      api: {
        default_status: normalizeActionListStatus(null),
        active_total: activeCount.rows[0].total,
        all_excludes_false: allCount.rows[0].total,
        all_include_false: allWithFalseCount.rows[0].total,
        closed_excludes_false: closedCount.rows[0].total,
      },
      search: {
        parsed: {
          'ISS-000123': parseIssueReferenceQuery('ISS-000123'),
          'ISS-123': parseIssueReferenceQuery('ISS-123'),
          '123': parseIssueReferenceQuery('123'),
        },
        iss000123_ids: hit123.rows.map((row) => ({ id: row.id, issue_number: row.issue_number })),
        iss123_ids: hitShort.rows.map((row) => ({ id: row.id, issue_number: row.issue_number })),
        num123_ids: hitNum.rows.map((row) => ({ id: row.id, issue_number: row.issue_number })),
      },
    }
    console.log(JSON.stringify(payload, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
