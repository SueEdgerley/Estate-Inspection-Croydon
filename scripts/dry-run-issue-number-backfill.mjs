/**
 * DRY-RUN ONLY sequential issue-number backfill.
 *
 * Reports which genuine actions would receive ISS-000001..N in created_at order.
 * Does not UPDATE. False [FALSE_AUTO_ACTION] rows stay unnumbered.
 *
 * Run: node --import ./scripts/esm-alias-register.mjs scripts/dry-run-issue-number-backfill.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { sqlExcludeFalseAutoActions, FALSE_ACTION_VOID_MARKER } from '../lib/false-action-cleanup.js'
import { formatIssueReference } from '../lib/issue-number.js'
import { OPENISH_ACTION_SQL } from '../lib/issue-number-backfill.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = path.join(root, 'scripts', '_tmp_issue-number-backfill-dry-run.json')

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

function summarise(row) {
  return {
    id: row.id,
    issue_number: Number(row.n),
    issue_reference: formatIssueReference(row.n),
    status: row.status,
    created_at: row.created_at,
    title: row.title,
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
    const column = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'actions'
         AND column_name = 'issue_number'
       LIMIT 1`
    )
    const hasIssueNumber = column.rows.length > 0
    const numberedExpr = hasIssueNumber ? 'issue_number IS NOT NULL' : 'FALSE'
    const unnumberedGenuineExpr = hasIssueNumber
      ? `issue_number IS NULL AND ${sqlExcludeFalseAutoActions('actions')}`
      : sqlExcludeFalseAutoActions('actions')
    const falseNumberedExpr = hasIssueNumber
      ? `issue_number IS NOT NULL AND strpos(COALESCE(repair_notes, ''), $1) > 0`
      : 'FALSE'

    const totals = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ${sqlExcludeFalseAutoActions('actions')})::int AS genuine,
         COUNT(*) FILTER (WHERE strpos(COALESCE(repair_notes, ''), $1) > 0)::int AS false_marked,
         COUNT(*) FILTER (WHERE ${OPENISH_ACTION_SQL} AND ${sqlExcludeFalseAutoActions('actions')})::int AS genuine_active,
         COUNT(*) FILTER (WHERE ${numberedExpr})::int AS already_numbered,
         COUNT(*) FILTER (WHERE ${unnumberedGenuineExpr})::int AS genuine_unnumbered,
         COUNT(*) FILTER (WHERE ${falseNumberedExpr})::int AS false_numbered
       FROM actions`,
      [FALSE_ACTION_VOID_MARKER]
    )

    const planned = await client.query(
      `SELECT
         id, status, title, created_at,
         ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS n
       FROM actions
       WHERE ${unnumberedGenuineExpr}
       ORDER BY created_at ASC, id ASC`
    )

    const payload = {
      dry_run: true,
      totals: totals.rows[0],
      would_assign: planned.rows.length,
      first: planned.rows.slice(0, 5).map(summarise),
      last: planned.rows.slice(-5).map(summarise),
      min_reference: planned.rows[0] ? formatIssueReference(planned.rows[0].n) : null,
      max_reference: planned.rows.length
        ? formatIssueReference(planned.rows[planned.rows.length - 1].n)
        : null,
    }

    fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2))
    console.log(JSON.stringify(payload, null, 2))
    console.log(`Wrote ${OUT_PATH}`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
