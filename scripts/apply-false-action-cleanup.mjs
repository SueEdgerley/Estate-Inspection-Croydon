/**
 * Apply the approved historical false-action clean-up.
 *
 * Updates ONLY the exact action IDs from the approved dry-run JSON.
 * Sets status=closed and appends [FALSE_AUTO_ACTION] to repair_notes.
 * Does not touch inspections, answers, photos, snapshots or PDFs.
 *
 * Run: APPLY_FALSE_ACTION_CLEANUP=1 node --import ./scripts/esm-alias-register.mjs scripts/apply-false-action-cleanup.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  FALSE_ACTION_VOID_MARKER,
  FALSE_ACTION_VOID_NOTE,
  sqlExcludeFalseAutoActions,
} from '../lib/false-action-cleanup.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN_PATH = path.join(root, 'scripts', '_tmp_false-action-cleanup-dry-run.json')
const OUT_PATH = path.join(root, 'scripts', '_tmp_false-action-cleanup-apply-result.json')
const SHRUBLANDS_INSPECTION_ID = 'e85924ff-d53b-4822-bdb6-0a7aa2004a0e'
const SHRUBLANDS_ACTION_ID = 'action_e85924ff-d53b-4822-bdb6-0a7aa2004a0e_1789656289694_5fukiak'
const SHRUBLANDS_Q12 = 'cm_canonical_internal_cleaning_q12'
const EXPECTED_ID_COUNT = 2645
const EXPECTED_OPEN_BEFORE = 3571
const EXPECTED_OPEN_AFTER = 926
const OPENISH = `lower(trim(COALESCE(status,''))) IN ('open', 'in_progress', 'in progress')`

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

function loadApprovedIds() {
  const payload = JSON.parse(fs.readFileSync(DRY_RUN_PATH, 'utf8'))
  const ids = [...new Set((payload.affected_ids || []).map((id) => String(id)))]
  if (ids.length !== EXPECTED_ID_COUNT) {
    throw new Error(`Dry-run ID count is ${ids.length}, expected ${EXPECTED_ID_COUNT}`)
  }
  if (!ids.includes(SHRUBLANDS_ACTION_ID)) {
    throw new Error('Approved dry-run IDs do not include the Shrublands Kowe action')
  }
  return ids
}

async function snapshotShrublands(client) {
  const inspection = await client.query(
    `SELECT id, status, submitted_at, updated_at, pdf_url, template_name, inspector_name, template_version
     FROM inspections WHERE id = $1`,
    [SHRUBLANDS_INSPECTION_ID]
  )
  const answer = await client.query(
    `SELECT question_id, answer_value, answer_text, notes, updated_at
     FROM inspection_answers
     WHERE inspection_id = $1 AND question_id = $2`,
    [SHRUBLANDS_INSPECTION_ID, SHRUBLANDS_Q12]
  )
  const photos = await client.query(
    `SELECT COUNT(*)::int AS c FROM inspection_photos WHERE inspection_id = $1`,
    [SHRUBLANDS_INSPECTION_ID]
  )
  const action = await client.query(
    `SELECT id, status, comment, repair_notes, auto_created, question_id, updated_at
     FROM actions WHERE id = $1`,
    [SHRUBLANDS_ACTION_ID]
  )
  const row = inspection.rows[0] || null
  let q12Text = null
  let tv = row?.template_version
  if (typeof tv === 'string') {
    try {
      tv = JSON.parse(tv)
    } catch {
      tv = null
    }
  }
  if (tv && typeof tv === 'object') {
    for (const section of tv.sections || []) {
      for (const question of section.questions || []) {
        if (question?.id === SHRUBLANDS_Q12) {
          q12Text = question.question_text || question.label || null
        }
      }
    }
  }
  return {
    inspection: row
      ? {
          id: row.id,
          status: row.status,
          submitted_at: row.submitted_at,
          updated_at: row.updated_at,
          pdf_url: row.pdf_url,
          template_name: row.template_name,
          inspector_name: row.inspector_name,
          q12_question_text: q12Text,
        }
      : null,
    answer: answer.rows[0] || null,
    photo_count: photos.rows[0]?.c || 0,
    action: action.rows[0] || null,
  }
}

async function main() {
  if (process.env.APPLY_FALSE_ACTION_CLEANUP !== '1') {
    console.error('Refusing to apply. Set APPLY_FALSE_ACTION_CLEANUP=1 to run the approved update.')
    process.exit(1)
  }

  loadEnv()
  const ids = loadApprovedIds()
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  await client.query(`
    ALTER TABLE actions
      ADD COLUMN IF NOT EXISTS repair_notes TEXT,
      ADD COLUMN IF NOT EXISTS repair_updated_at TIMESTAMPTZ
  `)

  const beforeOpen = await client.query(
    `SELECT COUNT(*)::int AS c FROM actions WHERE ${OPENISH}`
  )
  const beforeTarget = await client.query(
    `SELECT
       COUNT(*)::int AS existing,
       COUNT(*) FILTER (WHERE ${OPENISH})::int AS openish,
       COUNT(*) FILTER (WHERE lower(trim(COALESCE(status,''))) = 'closed')::int AS already_closed
     FROM actions
     WHERE id = ANY($1::text[])`,
    [ids]
  )
  const beforeShrublands = await snapshotShrublands(client)
  const beforeGenuineOpen = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM actions
     WHERE ${OPENISH}
       AND NOT (id = ANY($1::text[]))`,
    [ids]
  )

  await client.query('BEGIN')
  try {
    const updated = await client.query(
      `UPDATE actions
       SET
         status = 'closed',
         repair_notes = CASE
           WHEN repair_notes IS NULL OR trim(repair_notes) = '' THEN $2
           WHEN strpos(repair_notes, $3) > 0 THEN repair_notes
           ELSE repair_notes || E'\n\n' || $2
         END,
         repair_updated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::text[])
         AND ${OPENISH}
       RETURNING id`,
      [ids, FALSE_ACTION_VOID_NOTE, FALSE_ACTION_VOID_MARKER]
    )

    const afterOpen = await client.query(
      `SELECT COUNT(*)::int AS c FROM actions WHERE ${OPENISH}`
    )
    const afterTarget = await client.query(
      `SELECT
         COUNT(*)::int AS existing,
         COUNT(*) FILTER (WHERE lower(trim(COALESCE(status,''))) = 'closed')::int AS closed,
         COUNT(*) FILTER (WHERE strpos(COALESCE(repair_notes, ''), $2) > 0)::int AS marked,
         COUNT(*) FILTER (WHERE ${OPENISH})::int AS still_openish
       FROM actions
       WHERE id = ANY($1::text[])`,
      [ids, FALSE_ACTION_VOID_MARKER]
    )
    const afterGenuineOpen = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM actions
       WHERE ${OPENISH}
         AND NOT (id = ANY($1::text[]))`,
      [ids]
    )
    const analyticsMarkedStillCounted = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM actions a
       WHERE strpos(COALESCE(a.repair_notes, ''), $1) > 0
         AND ${sqlExcludeFalseAutoActions('a')}`,
      [FALSE_ACTION_VOID_MARKER]
    )
    const analyticsExcluded = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM actions a
       WHERE strpos(COALESCE(a.repair_notes, ''), $1) > 0`,
      [FALSE_ACTION_VOID_MARKER]
    )
    const afterShrublands = await snapshotShrublands(client)

    const inspectionUnchanged =
      beforeShrublands.inspection?.updated_at?.toString() === afterShrublands.inspection?.updated_at?.toString() &&
      beforeShrublands.inspection?.pdf_url === afterShrublands.inspection?.pdf_url &&
      beforeShrublands.answer?.answer_value === afterShrublands.answer?.answer_value &&
      beforeShrublands.answer?.updated_at?.toString() === afterShrublands.answer?.updated_at?.toString() &&
      beforeShrublands.photo_count === afterShrublands.photo_count &&
      beforeShrublands.inspection?.q12_question_text === afterShrublands.inspection?.q12_question_text

    const result = {
      applied: true,
      inspections_updated: 0,
      answers_updated: 0,
      photos_updated: 0,
      pdfs_updated: 0,
      approved_id_count: ids.length,
      updated_count: updated.rowCount,
      before: {
        dashboard_open: beforeOpen.rows[0].c,
        target_existing: beforeTarget.rows[0].existing,
        target_openish: beforeTarget.rows[0].openish,
        target_already_closed: beforeTarget.rows[0].already_closed,
        genuine_open_untouched: beforeGenuineOpen.rows[0].c,
      },
      after: {
        dashboard_open: afterOpen.rows[0].c,
        target_existing: afterTarget.rows[0].existing,
        target_closed: afterTarget.rows[0].closed,
        target_marked: afterTarget.rows[0].marked,
        target_still_openish: afterTarget.rows[0].still_openish,
        genuine_open_untouched: afterGenuineOpen.rows[0].c,
        analytics_marked_still_counted: analyticsMarkedStillCounted.rows[0].c,
        analytics_marked_excluded: analyticsExcluded.rows[0].c,
      },
      expected: {
        dashboard_open_before: EXPECTED_OPEN_BEFORE,
        dashboard_open_after: EXPECTED_OPEN_AFTER,
      },
      shrublands: {
        inspection_id: SHRUBLANDS_INSPECTION_ID,
        action_id: SHRUBLANDS_ACTION_ID,
        inspection_unchanged: inspectionUnchanged,
        before: beforeShrublands,
        after: afterShrublands,
      },
    }

    if (afterTarget.rows[0].still_openish !== 0) {
      throw new Error(`Target actions still open/in_progress: ${afterTarget.rows[0].still_openish}`)
    }
    if (afterTarget.rows[0].marked !== ids.length) {
      throw new Error(`Marked count ${afterTarget.rows[0].marked} !== ${ids.length}`)
    }
    if (analyticsMarkedStillCounted.rows[0].c !== 0) {
      throw new Error('Marked false actions would still be counted by Analytics')
    }
    if (beforeGenuineOpen.rows[0].c !== afterGenuineOpen.rows[0].c) {
      throw new Error('Open count of non-target actions changed')
    }
    if (!inspectionUnchanged) {
      throw new Error('Shrublands inspection/answer/photo/snapshot changed')
    }
    const afterAnswer = String(afterShrublands.answer?.answer_value || afterShrublands.answer?.answer_text || '')
    if (!/^yes$/i.test(afterAnswer.trim())) {
      throw new Error(`Shrublands q12 answer is no longer Yes: ${afterAnswer}`)
    }
    if (String(afterShrublands.action?.status || '').toLowerCase() !== 'closed') {
      throw new Error('Shrublands action was not closed')
    }
    if (!String(afterShrublands.action?.repair_notes || '').includes(FALSE_ACTION_VOID_MARKER)) {
      throw new Error('Shrublands action is missing the audit marker')
    }

    await client.query('COMMIT')
    fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('APPLY_ERROR', error.message)
  process.exit(1)
})
