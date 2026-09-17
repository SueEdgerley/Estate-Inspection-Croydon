/**
 * Apply sequential issue numbers to genuine actions in created_at order.
 * False [FALSE_AUTO_ACTION] rows remain unnumbered. Then set sequence DEFAULT
 * so new genuine inserts receive the next ISS number.
 *
 * Run: APPLY_ISSUE_NUMBER_BACKFILL=1 node --import ./scripts/esm-alias-register.mjs scripts/apply-issue-number-backfill.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { sqlExcludeFalseAutoActions, FALSE_ACTION_VOID_MARKER } from '../lib/false-action-cleanup.js'
import { formatIssueReference } from '../lib/issue-number.js'
import {
  ASSIGN_ISSUE_NUMBERS_SQL,
  OPENISH_ACTION_SQL,
  SET_ISSUE_NUMBER_DEFAULT_SQL,
} from '../lib/issue-number-backfill.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = path.join(root, 'scripts', '_tmp_issue-number-backfill-apply-result.json')

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

async function snapshot(client) {
  const result = await client.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE ${sqlExcludeFalseAutoActions('actions')})::int AS genuine,
       COUNT(*) FILTER (WHERE strpos(COALESCE(repair_notes, ''), $1) > 0)::int AS false_marked,
       COUNT(*) FILTER (WHERE ${OPENISH_ACTION_SQL} AND ${sqlExcludeFalseAutoActions('actions')})::int AS genuine_active,
       COUNT(*) FILTER (WHERE issue_number IS NOT NULL)::int AS numbered,
       COUNT(*) FILTER (WHERE issue_number IS NULL AND ${sqlExcludeFalseAutoActions('actions')})::int AS genuine_unnumbered,
       COUNT(*) FILTER (WHERE issue_number IS NOT NULL AND strpos(COALESCE(repair_notes, ''), $1) > 0)::int AS false_numbered,
       COALESCE(MIN(issue_number), 0)::int AS min_number,
       COALESCE(MAX(issue_number), 0)::int AS max_number
     FROM actions`,
    [FALSE_ACTION_VOID_MARKER]
  )
  return result.rows[0]
}

async function main() {
  if (process.env.APPLY_ISSUE_NUMBER_BACKFILL !== '1') {
    console.error('Refusing to apply. Set APPLY_ISSUE_NUMBER_BACKFILL=1 to run the approved backfill.')
    process.exit(1)
  }

  loadEnv()
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    await client.query('CREATE SEQUENCE IF NOT EXISTS actions_issue_number_seq')
    await client.query('ALTER TABLE actions ADD COLUMN IF NOT EXISTS issue_number INTEGER')
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS actions_issue_number_key ON actions (issue_number)')

    const before = await snapshot(client)
    await client.query('BEGIN')
    try {
      const updated = await client.query(ASSIGN_ISSUE_NUMBERS_SQL)
      const maxRow = await client.query('SELECT COALESCE(MAX(issue_number), 0)::int AS max FROM actions')
      const max = Number(maxRow.rows[0]?.max || 0)
      if (max > 0) {
        await client.query('SELECT setval($1, $2, true)', ['actions_issue_number_seq', max])
      }
      const afterAssign = await snapshot(client)
      if (Number(afterAssign.genuine_unnumbered) !== 0) {
        throw new Error(`Genuine unnumbered rows remain: ${afterAssign.genuine_unnumbered}`)
      }
      if (Number(afterAssign.false_numbered) !== 0) {
        throw new Error(`False actions were numbered: ${afterAssign.false_numbered}`)
      }
      await client.query(SET_ISSUE_NUMBER_DEFAULT_SQL)
      await client.query('COMMIT')

      const after = await snapshot(client)
      const payload = {
        applied: true,
        assigned: updated.rows.length,
        first: updated.rows.slice(0, 3).map((row) => ({
          id: row.id,
          issue_reference: formatIssueReference(row.issue_number),
          status: row.status,
        })),
        last: updated.rows.slice(-3).map((row) => ({
          id: row.id,
          issue_reference: formatIssueReference(row.issue_number),
          status: row.status,
        })),
        before,
        after,
        min_reference: formatIssueReference(after.min_number),
        max_reference: formatIssueReference(after.max_number),
      }
      fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2))
      console.log(JSON.stringify(payload, null, 2))
      console.log(`Wrote ${OUT_PATH}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
