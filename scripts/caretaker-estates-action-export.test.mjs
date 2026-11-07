/**
 * Estate Services actions for caretaker section 2 photo emails, and the
 * Issues / Actions CSV export.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/caretaker-estates-action-export.test.mjs
 */
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { roleMayExportActionList } from '../lib/action-export-access.js'
import {
  ACTION_EXPORT_COLUMNS,
  buildActionsExportCsv,
  escapeCsvCell,
} from '../lib/action-export-csv.js'
import { filterActionsForView } from '../lib/action-list-view-filters.js'
import { nextCompletionTimestamp } from '../lib/action-completion.js'
import {
  deliverCaretakerEstatesMailboxNotification,
  ensureCaretakerEstatesMailboxAction,
  recoverCaretakerEstatesMailboxNotifications,
} from '../lib/caretaker-estates-mailbox-action.js'

const INSPECTION_ID = '8f3c1a20-6b14-4d2e-9c55-0a77e2b91d04'

function memorySql() {
  const rows = []
  let inserts = 0
  let updates = 0
  const sql = {
    async query(text, values = []) {
      const compact = String(text).replace(/\s+/g, ' ')
      if (compact.includes('SELECT id, issue_number') && compact.includes('question_id')) {
        const found = rows.filter(
          (row) => row.inspection_id === values[0] && row.question_id === values[1]
        )
        return {
          rows: found.slice(0, 1).map((row) => ({ id: row.id, issue_number: row.issue_number })),
        }
      }
      if (compact.includes("nextval('actions_issue_number_seq')")) {
        updates += 1
        const row = rows.find((item) => item.id === values[0])
        if (row && !row.issue_number) row.issue_number = 15
        return { rows: [{ issue_number: row?.issue_number ?? null }] }
      }
      if (compact.includes('SELECT issue_number FROM actions WHERE id')) {
        const row = rows.find((item) => item.id === values[0])
        return { rows: [{ issue_number: row?.issue_number ?? null }] }
      }
      throw new Error(`unexpected sql: ${compact}`)
    },
  }
  const insertAction = async (_sql, payload) => {
    inserts += 1
    const fields = Object.fromEntries(payload.fields)
    const row = { ...fields, issue_number: null }
    rows.push(row)
    return { rows: [{ id: row.id, issue_number: null }] }
  }
  return {
    sql,
    insertAction,
    rows,
    counts: () => ({ inserts, updates }),
  }
}

function actionInput(answer) {
  return {
    inspectionId: INSPECTION_ID,
    sectionId: 'external_cleaning',
    sectionTitle: '2. External Cleaning - Cleaning completed for ...',
    questionId: 'ct_fly_tipping',
    questionText: 'Fly Tipping',
    answer,
    comment: 'Black bags beside the bin store',
    photoUrls: ['https://example.blob.core.windows.net/photos/fly-tip.jpg'],
    blockAddress: 'Regina Court, 14 High Street',
    blockId: 'block_regina',
    submittedBy: 'Priya Shah',
    inspectionDate: '2026-10-08T09:30:00.000Z',
    baseUrl: 'https://estateinspections.co.uk',
  }
}

const depsFor = (memory) => ({
  insertAction: memory.insertAction,
  ensureIssueNumbers: async () => true,
})

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const src = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value !== ''))
}

describe('caretaker estates action', () => {
  it('creates one open action from the photo details, including a blank answer', async () => {
    const memory = memorySql()
    const created = await ensureCaretakerEstatesMailboxAction(
      memory.sql,
      actionInput(''),
      depsFor(memory)
    )
    assert.equal(created.created, true)
    assert.equal(created.issueReference, 'ISS-000015')
    assert.equal(
      created.actionUrl,
      `https://estateinspections.co.uk/actions?inspection_id=${INSPECTION_ID}&action_id=${encodeURIComponent(created.id)}`
    )
    const saved = memory.rows[0]
    assert.equal(saved.status, 'open')
    assert.equal(saved.comment, 'Black bags beside the bin store')
    assert.equal(saved.question_id, 'ct_fly_tipping')
    assert.equal(saved.inspection_id, INSPECTION_ID)
    assert.match(saved.description, /Question: Fly Tipping/)
    assert.match(saved.description, /Answer: —/)
    assert.match(saved.description, /Priya Shah/)
    assert.deepEqual(JSON.parse(saved.photo_urls), [
      'https://example.blob.core.windows.net/photos/fly-tip.jpg',
    ])
  })

  it('reuses the same action when the submission is retried', async () => {
    const memory = memorySql()
    const first = await ensureCaretakerEstatesMailboxAction(
      memory.sql,
      actionInput('Yes'),
      depsFor(memory)
    )
    const second = await ensureCaretakerEstatesMailboxAction(
      memory.sql,
      actionInput('Yes'),
      depsFor(memory)
    )
    assert.equal(first.created, true)
    assert.equal(second.created, false)
    assert.equal(second.id, first.id)
    assert.equal(second.issueReference, 'ISS-000015')
    assert.equal(memory.counts().inserts, 1)
    assert.equal(memory.counts().updates, 1)
    assert.match(memory.rows[0].description, /Answer: Yes/)
  })

  it('does not send the notification when the action cannot be saved, and a retry sends it once', async () => {
    const store = deliveryStore()
    store.failInserts = 1
    let sends = 0
    const sendEmail = async () => {
      sends += 1
      return { ok: true, provider: 'resend', id: 'msg_1' }
    }
    const deps = {
      ...depsFor(store),
      ensureTracking: async () => true,
      sendEmail,
    }
    const first = await deliverCaretakerEstatesMailboxNotification(store.sql, actionInput('No'), deps)
    assert.equal(first.actionSaved, false)
    assert.equal(first.sent, false)
    assert.match(first.warning, /could not track Fly Tipping/)
    assert.match(first.warning, /notification was not sent/)
    assert.match(first.warning, /Retry Estate Services notification/)
    assert.equal(sends, 0)
    assert.equal(store.recovery.length, 1)

    const recovered = await recoverCaretakerEstatesMailboxNotifications(store.sql, INSPECTION_ID, deps)
    assert.equal(recovered.sent, 1)
    assert.equal(sends, 1)
    assert.equal(store.actions[0].notification_sent_at instanceof Date, true)
    assert.equal(store.recovery.length, 0)

    const again = await recoverCaretakerEstatesMailboxNotifications(store.sql, INSPECTION_ID, deps)
    assert.equal(again.sent, 0)
    assert.equal(sends, 1)
  })

  it('leaves Notification sent blank when the provider rejects it, then sends once on retry', async () => {
    const store = deliveryStore()
    const attempts = []
    const sendEmail = async () => {
      attempts.push('send')
      if (attempts.length === 1) return { ok: false, error: 'provider_rejected' }
      return { ok: true, provider: 'resend', id: 'msg_2' }
    }
    const deps = {
      ...depsFor(store),
      ensureTracking: async () => true,
      sendEmail,
    }
    const first = await deliverCaretakerEstatesMailboxNotification(store.sql, actionInput('Yes'), deps)
    assert.equal(first.actionSaved, true)
    assert.equal(first.sent, false)
    assert.equal(store.actions[0].notification_sent_at, null)
    assert.match(first.warning, /did not accept the notification/)
    assert.equal(store.recovery.length, 1)
    assert.match(first.content.text, /ISS-000015/)
    assert.match(first.content.text, /View full inspection report/)

    const recovered = await recoverCaretakerEstatesMailboxNotifications(store.sql, INSPECTION_ID, deps)
    assert.equal(recovered.sent, 1)
    assert.equal(attempts.length, 2)
    assert.equal(store.actions.length, 1)
    assert.ok(store.actions[0].notification_sent_at)
    assert.equal(store.recovery.length, 0)
  })

  it('does not send again when the provider accepted the email but Notification sent was not saved', async () => {
    const store = deliveryStore()
    store.failStamps = 1
    let sends = 0
    const sendEmail = async () => {
      sends += 1
      return { ok: true, provider: 'resend', id: 'msg_accepted' }
    }
    const deps = {
      ...depsFor(store),
      ensureTracking: async () => true,
      sendEmail,
    }
    const first = await deliverCaretakerEstatesMailboxNotification(store.sql, actionInput('Yes'), deps)
    assert.equal(first.sent, true)
    assert.equal(sends, 1)
    assert.equal(store.actions[0].notification_sent_at, null)
    assert.equal(store.recovery[0].stage, 'provider_accepted')
    const acceptedAt = store.recovery[0].payload.providerAcceptedAt
    assert.ok(acceptedAt)

    const second = await deliverCaretakerEstatesMailboxNotification(store.sql, actionInput('Yes'), deps)
    assert.equal(second.sent, false)
    assert.equal(second.skipped, true)
    assert.equal(sends, 1)
    assert.equal(store.actions.length, 1)
    assert.equal(new Date(store.actions[0].notification_sent_at).toISOString(), acceptedAt)
    assert.equal(store.recovery.length, 0)
  })
})

function deliveryStore() {
  const actions = []
  const recovery = []
  const api = {
    actions,
    recovery,
    failInserts: 0,
    failStamps: 0,
    sql: {
      async query(text, values = []) {
        const compact = String(text).replace(/\s+/g, ' ')
        if (compact.includes('SELECT id, issue_number') && compact.includes('question_id')) {
          const found = actions.filter(
            (row) => row.inspection_id === values[0] && row.question_id === values[1]
          )
          return { rows: found.slice(0, 1) }
        }
        if (compact.includes("nextval('actions_issue_number_seq')")) {
          const row = actions.find((item) => item.id === values[0])
          if (row && !row.issue_number) row.issue_number = 15
          return { rows: [{ issue_number: row?.issue_number ?? null }] }
        }
        if (compact.includes('SELECT issue_number FROM actions WHERE id')) {
          const row = actions.find((item) => item.id === values[0])
          return { rows: [{ issue_number: row?.issue_number ?? null }] }
        }
        if (compact.includes('SELECT notification_sent_at FROM actions')) {
          const row = actions.find((item) => item.id === values[0])
          return { rows: [{ notification_sent_at: row?.notification_sent_at || null }] }
        }
        if (compact.includes('FROM outbound_emails')) return { rows: [] }
        if (compact.includes('INSERT INTO caretaker_estates_action_recovery')) {
          const existing = recovery.find(
            (row) => row.inspection_id === values[0] && row.question_id === values[1]
          )
          const next = {
            inspection_id: values[0],
            question_id: values[1],
            stage: values[2],
            last_error: values[3],
            payload: JSON.parse(values[4]),
          }
          if (existing) Object.assign(existing, next)
          else recovery.push(next)
          return { rows: [] }
        }
        if (compact.includes('DELETE FROM caretaker_estates_action_recovery')) {
          const index = recovery.findIndex(
            (row) => row.inspection_id === values[0] && row.question_id === values[1]
          )
          if (index >= 0) recovery.splice(index, 1)
          return { rows: [] }
        }
        if (compact.includes('SELECT stage, payload')) {
          const row = recovery.find(
            (item) => item.inspection_id === values[0] && item.question_id === values[1]
          )
          return { rows: row ? [{ stage: row.stage, payload: row.payload }] : [] }
        }
        if (compact.includes('FROM caretaker_estates_action_recovery')) {
          return {
            rows: recovery
              .filter((row) => row.inspection_id === values[0])
              .map((row) => ({ question_id: row.question_id, payload: row.payload })),
          }
        }
        if (compact.includes('SET notification_claim_at = CURRENT_TIMESTAMP')) {
          const row = actions.find((item) => item.id === values[0] && !item.notification_sent_at && !item.claimed)
          if (!row) return { rows: [] }
          row.claimed = true
          return { rows: [{ id: row.id }] }
        }
        if (compact.includes('SET notification_sent_at = $2')) {
          if (api.failStamps > 0) {
            api.failStamps -= 1
            throw new Error('could not save notification sent')
          }
          const row = actions.find((item) => item.id === values[0])
          if (row) {
            row.notification_sent_at = values[1]
            row.claimed = false
          }
          return { rows: [] }
        }
        if (compact.includes('SET notification_claim_at = NULL')) {
          const row = actions.find((item) => item.id === values[0])
          if (row) row.claimed = false
          return { rows: [] }
        }
        throw new Error(`unexpected sql: ${compact}`)
      },
    },
  }
  api.insertAction = async (_sql, payload) => {
    if (api.failInserts > 0) {
      api.failInserts -= 1
      throw new Error('database unavailable')
    }
    const fields = Object.fromEntries(payload.fields)
    const row = { ...fields, issue_number: null, notification_sent_at: null, claimed: false }
    actions.push(row)
    return { rows: [{ id: row.id, issue_number: null }] }
  }
  return api
}

describe('completion date', () => {
  const now = new Date('2026-10-12T14:15:00.000Z')

  it('records the time an action is marked completed and clears it when reopened', () => {
    assert.equal(nextCompletionTimestamp('open', 'completed', now), now)
    assert.equal(nextCompletionTimestamp('in_progress', 'completed', now), now)
    assert.equal(nextCompletionTimestamp('closed', 'completed', now), now)
    assert.equal(nextCompletionTimestamp('completed', 'open', now), null)
    assert.equal(nextCompletionTimestamp('completed', 'in_progress', now), null)
    assert.equal(nextCompletionTimestamp('completed', 'closed', now), undefined)
    assert.equal(nextCompletionTimestamp('open', 'closed', now), undefined)
    assert.equal(nextCompletionTimestamp('completed', 'completed', now), undefined)
    assert.equal(nextCompletionTimestamp('open', 'in_progress', now), undefined)
  })
})

describe('issues export', () => {
  const flyTip = {
    id: 'action_estates_1',
    issue_number: 15,
    inspection_id: INSPECTION_ID,
    inspection_submitted_at: '2026-10-08T09:30:00.000Z',
    inspection_created_at: '2026-10-08T09:00:00.000Z',
    created_at: '2026-11-01T12:00:00.000Z',
    inspection_inspector_name: 'Priya Shah',
    block_name: 'Regina Court, 14 High Street',
    title: '2. External Cleaning – Fly Tipping',
    description: 'Question: Fly Tipping\nAnswer: Yes\nComment: Black bags beside the bin store',
    comment: '=HYPERLINK("http://evil")',
    photo_urls: ['https://example.blob.core.windows.net/photos/fly-tip.jpg'],
    assigned_to: 'Alex Officer',
    priority: 'high',
    status: 'open',
    job_number: 'JOB-9',
    expected_completion_date: '2026-10-20',
    repair_notes: 'Crew booked',
  }
  const other = {
    ...flyTip,
    id: 'action_other',
    issue_number: 16,
    inspection_submitted_at: '2026-10-10T09:00:00.000Z',
    block_name: 'Other Court',
    comment: 'Leaves',
    assigned_to: 'Sam Rivers',
  }

  it('exports every filtered row with the tracker columns and a blank completion date', () => {
    const filtered = filterActionsForView([flyTip, other], { location: 'Regina' })
    assert.equal(filtered.length, 1)
    const table = parseCsv(buildActionsExportCsv(filtered, { baseUrl: 'https://estateinspections.co.uk' }))
    assert.deepEqual(table[0], ACTION_EXPORT_COLUMNS)
    const row = Object.fromEntries(ACTION_EXPORT_COLUMNS.map((column, index) => [column, table[1][index]]))
    assert.equal(row['Action reference'], 'ISS-000015')
    assert.match(row['Date raised'], /1 November 2026/)
    assert.match(row['Inspection submitted'], /8 October 2026/)
    assert.equal(row['Notification sent'], '')
    assert.equal(row['Caretaker’s name'], 'Priya Shah')
    assert.equal(row['Block/address'], 'Regina Court, 14 High Street')
    assert.equal(row.Question, 'Fly Tipping')
    assert.equal(row.Answer, 'Yes')
    assert.equal(row.Comments, '\'=HYPERLINK("http://evil")')
    assert.equal(row['Photo links'], 'https://example.blob.core.windows.net/photos/fly-tip.jpg')
    assert.equal(row['Inspection report link'], `https://estateinspections.co.uk/inspections/${INSPECTION_ID}`)
    assert.equal(row['Assigned officer'], 'Alex Officer')
    assert.equal(row.Priority, 'High')
    assert.equal(row.Status, 'Open')
    assert.equal(row['Job number'], 'JOB-9')
    assert.equal(row['Expected completion date'], '2026-10-20')
    assert.equal(row['Completion date'], '')
    assert.equal(row['Progress/completion notes'], 'Crew booked')
    const completed = {
      ...flyTip,
      id: 'action_estates_completed',
      status: 'completed',
      completed_at: '2026-10-12T14:15:00.000Z',
      notification_sent_at: '2026-10-08T10:05:00.000Z',
    }
    const completedRow = Object.fromEntries(
      ACTION_EXPORT_COLUMNS.map((column, index) => [
        column,
        parseCsv(buildActionsExportCsv([completed], { baseUrl: 'https://estateinspections.co.uk' }))[1][index],
      ])
    )
    assert.match(completedRow['Completion date'], /12 October 2026/)
    assert.match(completedRow['Notification sent'], /8 October 2026/)
    const historic = { ...flyTip, id: 'old_completed', status: 'completed', completed_at: null, notification_sent_at: null }
    const historicRow = Object.fromEntries(
      ACTION_EXPORT_COLUMNS.map((column, index) => [
        column,
        parseCsv(buildActionsExportCsv([historic], { baseUrl: 'https://estateinspections.co.uk' }))[1][index],
      ])
    )
    assert.equal(historicRow['Completion date'], '')
    assert.equal(historicRow['Notification sent'], '')
    assert.equal(table.length, 2)
  })

  it('neutralises spreadsheet formulas', () => {
    assert.equal(escapeCsvCell('=1+1'), "'=1+1")
    assert.equal(escapeCsvCell('+1'), "'+1")
    assert.equal(escapeCsvCell('-1'), "'-1")
    assert.equal(escapeCsvCell('@sum'), "'@sum")
    assert.equal(escapeCsvCell('Safe, value'), '"Safe, value"')
  })

  it('limits export to administrators and Estate Services Managers', () => {
    assert.equal(roleMayExportActionList('admin', false), true)
    assert.equal(roleMayExportActionList('owner', false), true)
    assert.equal(roleMayExportActionList('user', true), true)
    assert.equal(roleMayExportActionList('esm', false), true)
    assert.equal(roleMayExportActionList('housing_officer', false), false)
    assert.equal(roleMayExportActionList('housing_team_manager', false), false)
    assert.equal(roleMayExportActionList('caretaker', false), false)
    assert.equal(roleMayExportActionList('resident', false), false)
  })

  it('uses the same tracker permission and the full filtered query for the download', () => {
    const route = readFileSync(new URL('../app/api/actions/route.js', import.meta.url), 'utf8')
    const page = readFileSync(new URL('../app/actions/page.jsx', import.meta.url), 'utf8')
    assert.match(route, /roleMayExportActionList\(roleCtx\.normalized, roleCtx\.clerkIsAdmin\)/)
    assert.match(route, /filterActionsForView\(dedupedRows/)
    assert.match(route, /format'\) === 'csv'/)
    assert.doesNotMatch(route, /LIMIT\s+\$\{/)
    assert.match(page, /Export to Excel \(CSV\)/)
    assert.match(page, /canExportActions \?/)
    assert.match(page, /params\.set\('format', 'csv'\)/)
    assert.match(page, /params\.set\('date_from', filters\.dateFrom\)/)
    assert.match(page, /params\.set\('location', filters\.location\)/)
  })
})
