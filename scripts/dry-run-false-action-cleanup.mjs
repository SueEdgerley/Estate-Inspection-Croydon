/**
 * DRY-RUN ONLY historical false-action clean-up.
 *
 * Identifies high-confidence false Issues/Actions. Does not UPDATE or DELETE.
 * Does not touch inspections, answers, photos, snapshots or PDFs.
 *
 * Run: node --import ./scripts/esm-alias-register.mjs scripts/dry-run-false-action-cleanup.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  isHighConfidenceEsmFalseAction,
  isHighConfidenceCaretakerQ12FalseAction,
  isHighConfidenceGroundsS3FalseAction,
  isOpenishActionStatus,
  FALSE_ACTION_VOID_NOTE,
  FALSE_ACTION_VOID_MARKER,
} from '../lib/false-action-cleanup.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = path.join(root, 'scripts', '_tmp_false-action-cleanup-dry-run.json')

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

function unpackNotes(notes) {
  const raw = String(notes || '')
  if (!raw) return { raise_issue: false, comment: '' }
  const marker = '__NV_JSON__V1__'
  let structured = null
  try {
    structured = raw.startsWith(marker) ? JSON.parse(raw.slice(marker.length)) : JSON.parse(raw)
  } catch {
    structured = null
  }
  const sc = structured && typeof structured === 'object' ? structured : {}
  const comment =
    typeof sc.comment === 'string' && sc.comment.trim()
      ? sc.comment.trim()
      : !structured && raw && !raw.startsWith('{') && !raw.startsWith(marker)
        ? raw.trim()
        : ''
  return { raise_issue: sc.raise_issue === true, comment }
}

function summariseRow(row) {
  return {
    id: row.id,
    inspection_id: row.inspection_id,
    question_id: row.question_id,
    status: row.status,
    auto_created: row.auto_created,
    template_name: row.template_name,
    inspector_name: row.inspector_name,
    title: row.title,
    answer: row.answer,
    comment: row.comment,
  }
}

async function main() {
  if (process.env.APPLY_FALSE_ACTION_CLEANUP === '1') {
    console.error('Refusing to apply. This script is dry-run only.')
    process.exit(1)
  }

  loadEnv()
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  const overall = await client.query(`
    SELECT
      COUNT(*)::int AS total_actions,
      COUNT(*) FILTER (
        WHERE lower(trim(COALESCE(status,''))) IN ('open', 'in_progress', 'in progress')
      )::int AS dashboard_open
    FROM actions
  `)

  const rows = await client.query(`
    SELECT
      a.id,
      a.inspection_id,
      a.question_id,
      a.status,
      a.auto_created,
      a.comment,
      a.recipient_person_id,
      a.title,
      i.template_name,
      i.inspector_name,
      COALESCE(ia.answer_value, ia.answer_text, '') AS answer,
      ia.notes
    FROM actions a
    JOIN inspections i ON i.id = a.inspection_id
    LEFT JOIN inspection_answers ia
      ON ia.inspection_id = a.inspection_id AND ia.question_id = a.question_id
    WHERE lower(trim(COALESCE(a.status,''))) IN ('open', 'in_progress', 'in progress')
  `)

  const esm = []
  const caretaker = []
  const grounds = []

  for (const row of rows.rows) {
    const extras = unpackNotes(row.notes)
    const comment = (typeof row.comment === 'string' && row.comment.trim()) || extras.comment || ''
    const classified = { ...row, comment }
    const template = String(row.template_name || '').toLowerCase()

    if (template.includes('esm')) {
      if (
        isHighConfidenceEsmFalseAction({
          grade: row.answer,
          comment,
          raiseIssue: extras.raise_issue,
        })
      ) {
        esm.push(classified)
      }
      continue
    }

    if (template.includes('caretaker')) {
      if (
        isHighConfidenceCaretakerQ12FalseAction({
          questionId: row.question_id,
          autoCreated: row.auto_created,
          comment,
        })
      ) {
        caretaker.push(classified)
      }
      continue
    }

    if (template.includes('grounds')) {
      if (
        isHighConfidenceGroundsS3FalseAction({
          questionId: row.question_id,
          answer: row.answer,
          comment,
        })
      ) {
        grounds.push(classified)
      }
    }
  }

  const selected = [...esm, ...caretaker, ...grounds]
  const openNow = overall.rows[0].dashboard_open
  const wouldClose = selected.filter((row) => isOpenishActionStatus(row.status)).length

  const summary = {
    mode: 'dry-run',
    applied: false,
    database_writes: 0,
    inspections_updated: 0,
    answers_updated: 0,
    photos_updated: 0,
    pdfs_updated: 0,
    proposed_method: {
      action: 'close',
      new_status: 'closed',
      audit_marker: FALSE_ACTION_VOID_MARKER,
      audit_note: FALSE_ACTION_VOID_NOTE,
      audit_field: 'repair_notes',
      why: 'closed is already a valid action status used by the Home KPI (open/in_progress only). Records are retained for audit instead of being deleted. Inspection answers, photos, snapshots and PDFs are not touched.',
      home_dashboard: 'Will drop immediately, because Home only counts open/in_progress.',
      active_issues_view:
        'The current Issues page lists every status. Closed records would no longer be Open/Outstanding, but would still be visible until a later default filter hides closed from the active list.',
      analytics_note:
        'Analytics top-issue queries currently count all action statuses. Closing these records will not by itself remove them from Analytics until a later status (or [FALSE_AUTO_ACTION] marker) filter is added.',
    },
    before: {
      total_actions: overall.rows[0].total_actions,
      dashboard_open: openNow,
    },
    would_close: {
      esm_abna_photo_false: esm.length,
      caretaker_q12_empty_comment: caretaker.length,
      grounds_s3_satisfactory_filler: grounds.length,
      total: wouldClose,
    },
    after_if_applied: {
      dashboard_open: openNow - wouldClose,
      total_actions_unchanged: overall.rows[0].total_actions,
    },
    samples: {
      esm: esm.slice(0, 5).map(summariseRow),
      caretaker: caretaker.slice(0, 5).map(summariseRow),
      grounds: grounds.slice(0, 5).map(summariseRow),
    },
    affected_ids: selected.map((row) => row.id),
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2))
  const printed = { ...summary, affected_ids: `${selected.length} ids written to ${OUT_PATH}` }
  console.log(JSON.stringify(printed, null, 2))
  await client.end()
}

main().catch((error) => {
  console.error('DRY_RUN_ERROR', error.message)
  process.exit(1)
})
