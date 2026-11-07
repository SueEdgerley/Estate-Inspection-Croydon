/**
 * One Estate Services action for each caretaker section 2 photo notification.
 * The caller decides when a photo should notify the estates mailbox. This does
 * not add a Yes/No condition and does not send the email.
 */
import { insertActionWithOptionalColumns } from '@/lib/action-insert-columns'
import { buildCaretakerActionDescription } from '@/lib/caretaker-action-details'
import { ensureCaretakerActionTrackingFields } from '@/lib/caretaker-estates-action-fields'
import {
  buildCaretakerActionUrl,
  buildCaretakerEstatesMailboxNotification,
  CARETAKER_ESTATES_MAILBOX_EMAIL,
  caretakerNotificationPublicBaseUrl,
} from '@/lib/caretaker-estates-mailbox-notification'
import { ensureIssueNumberFields } from '@/lib/issue-number-fields'
import { formatIssueReference } from '@/lib/issue-number'
import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'

export const CARETAKER_ESTATES_ACTION_CATEGORY = 'external_cleaning'

const EXISTING_ACTION_SQL = `
  SELECT id, issue_number, notification_sent_at, created_at
  FROM actions
  WHERE inspection_id = $1 AND question_id = $2
  ORDER BY created_at ASC
  LIMIT 1
`

export const CARETAKER_ESTATES_NOTIFICATION_ROUTING = 'caretaker_section_2_photo'

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clip(value, max) {
  const text = collapse(value)
  if (!text) return null
  return text.length <= max ? text : text.slice(0, max)
}

function photoList(value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map((url) => collapse(url)).filter(Boolean))]
}

function completedAtIso(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function estatesActionId(inspectionId, questionId) {
  const raw = `action_estates_${inspectionId}_${questionId}`
  return raw.length <= 255 ? raw : raw.slice(0, 255)
}

async function selectExistingAction(sql, inspectionId, questionId) {
  const result = await sql.query(EXISTING_ACTION_SQL, [inspectionId, questionId])
  return result?.rows?.[0] || null
}

async function ensureActionIssueNumber(sql, actionId, currentNumber, ensureIssueNumbers) {
  const current = Number(currentNumber)
  if (Number.isInteger(current) && current > 0) return current
  try {
    await ensureIssueNumbers(sql)
    const updated = await sql.query(
      `UPDATE actions
       SET issue_number = nextval('actions_issue_number_seq')
       WHERE id = $1 AND issue_number IS NULL
       RETURNING issue_number`,
      [actionId]
    )
    const assigned = Number(updated?.rows?.[0]?.issue_number)
    if (Number.isInteger(assigned) && assigned > 0) return assigned
  } catch (error) {
    console.warn('[caretaker-estates-mailbox-action] issue number:', error?.message || error)
  }
  try {
    const again = await sql.query('SELECT issue_number FROM actions WHERE id = $1', [actionId])
    const stored = Number(again?.rows?.[0]?.issue_number)
    if (Number.isInteger(stored) && stored > 0) return stored
  } catch {
    // The action can still be opened by its id when a reference is not available.
  }
  return null
}

/**
 * Create the action when this inspection/question does not already have one.
 * A retry finds the existing row and does not insert another.
 */
export async function ensureCaretakerEstatesMailboxAction(sql, input = {}, deps = {}) {
  const inspectionId = collapse(input.inspectionId)
  const questionId = collapse(input.questionId)
  if (!inspectionId || !questionId || typeof sql?.query !== 'function') return null

  const insertAction = deps.insertAction || insertActionWithOptionalColumns
  const ensureIssueNumbers = deps.ensureIssueNumbers || ensureIssueNumberFields
  const photos = photoList(input.photoUrls)
  const questionText = collapse(input.questionText) || questionId
  const sectionName = collapse(input.sectionName || input.sectionTitle)
  const answerLabel = collapse(input.answer) || '—'
  const comment = collapse(input.comment)
  const submittedBy = collapse(input.submittedBy)
  const blockAddress = collapse(input.blockAddress)
  const when = completedAtIso(input.inspectionDate)

  let row = await selectExistingAction(sql, inspectionId, questionId)
  let created = false
  if (!row) {
    const actionId = estatesActionId(inspectionId, questionId)
    const description = buildCaretakerActionDescription({
      inspectionId,
      completedAtIso: when,
      estateBlockLine: blockAddress,
      sectionName,
      questionText,
      answerLabel,
      comment,
      photoRefs: photos.join('; '),
      category: CARETAKER_ESTATES_ACTION_CATEGORY,
      assigneeLabel: '',
      submittedBy,
    })
    const title = clip(`${sectionName ? `${sectionName} – ` : ''}${questionText}`, 500) || 'Caretaker inspection issue'
    try {
      const inserted = await insertAction(sql, {
        fields: [
          ['id', actionId],
          ['inspection_id', inspectionId],
          ['section_id', clip(input.sectionId, 50)],
          ['section_name', clip(sectionName, 255)],
          ['question_id', clip(questionId, 255)],
          ['category', CARETAKER_ESTATES_ACTION_CATEGORY],
          ['priority', null],
          ['title', title],
          ['description', description],
          ['location', clip(blockAddress, 500)],
          ['status', 'open'],
          ['comment', comment || null],
          ['recipient_person_id', null],
          ['auto_created', true],
          ['photo_urls', JSON.stringify(photos)],
        ],
        optionalFields: [['block_id', clip(input.blockId, 255)]],
        returning: true,
      })
      row = inserted?.rows?.[0] || { id: actionId, issue_number: null }
      created = true
    } catch (error) {
      row = await selectExistingAction(sql, inspectionId, questionId)
      if (!row) throw error
    }
  }

  const issueNumber = await ensureActionIssueNumber(
    sql,
    row.id,
    row.issue_number,
    ensureIssueNumbers
  )
  const origin = input.baseUrl || caretakerNotificationPublicBaseUrl()
  return {
    id: row.id,
    issueNumber,
    issueReference: formatIssueReference(issueNumber),
    actionUrl: buildCaretakerActionUrl(inspectionId, row.id, origin),
    notificationSentAt: row.notification_sent_at || null,
    createdAt: row.created_at || null,
    created,
  }
}

export function caretakerEstatesActionFailureWarning(questionText) {
  const question = collapse(questionText) || 'this question'
  return `Estate Services could not track ${question}. The notification was not sent. On this inspection, choose Retry Estate Services notification. That retry is kept in the database, so it is still there after the browser is closed or the server restarts. It reuses the same action and does not send another notification once the provider has accepted the first one.`
}

export function caretakerEstatesNotificationFailureWarning(questionText, issueReference) {
  const question = collapse(questionText) || 'this question'
  const reference = collapse(issueReference)
  const labelled = reference ? `${reference} for ${question}` : question
  return `The Estate Services action ${labelled} is in the tracker, but the email provider did not accept the notification. Notification sent was left blank. On this inspection, choose Retry Estate Services notification. That sends it once and does not create a second action.`
}

function recoveryPayload(fields) {
  return {
    inspectionId: collapse(fields.inspectionId),
    sectionId: fields.sectionId || null,
    sectionTitle: fields.sectionTitle || fields.sectionName || '',
    questionId: collapse(fields.questionId),
    questionText: fields.questionText || '',
    answer: fields.answer ?? '',
    comment: fields.comment || '',
    photoUrls: photoList(fields.photoUrls),
    blockAddress: fields.blockAddress || '',
    blockId: fields.blockId || '',
    submittedBy: fields.submittedBy || '',
    inspectionDate: fields.inspectionDate || null,
    reminder: fields.reminder || '',
    baseUrl: fields.baseUrl || '',
  }
}

function readPayload(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }
  return value
}

async function queueCaretakerEstatesRecovery(sql, fields, stage, errorMessage, extra = {}) {
  const inspectionId = collapse(fields.inspectionId)
  const questionId = collapse(fields.questionId)
  if (!inspectionId || !questionId) return
  await sql.query(
    `INSERT INTO caretaker_estates_action_recovery
       (inspection_id, question_id, stage, last_error, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (inspection_id, question_id)
     DO UPDATE SET
       stage = EXCLUDED.stage,
       last_error = EXCLUDED.last_error,
       payload = EXCLUDED.payload,
       updated_at = CURRENT_TIMESTAMP`,
    [
      inspectionId,
      questionId,
      stage,
      errorMessage || null,
      JSON.stringify({ ...recoveryPayload(fields), ...extra }),
    ]
  )
}

async function readQueuedRecovery(sql, inspectionId, questionId) {
  const result = await sql.query(
    `SELECT stage, payload
     FROM caretaker_estates_action_recovery
     WHERE inspection_id = $1 AND question_id = $2`,
    [collapse(inspectionId), collapse(questionId)]
  )
  const row = result?.rows?.[0]
  if (!row) return null
  return { stage: row.stage, payload: readPayload(row.payload) }
}

export async function listCaretakerEstatesRecovery(sql, inspectionId) {
  const ensureTracking = ensureCaretakerActionTrackingFields
  await ensureTracking(sql)
  const id = collapse(inspectionId)
  if (!id) return []
  const result = await sql.query(
    `SELECT question_id, stage, last_error, payload
     FROM caretaker_estates_action_recovery
     WHERE inspection_id = $1
     ORDER BY question_id`,
    [id]
  )
  return (result?.rows || []).map((row) => {
    const payload = readPayload(row.payload)
    return {
      questionId: row.question_id,
      questionText: payload.questionText || row.question_id,
      stage: row.stage,
      lastError: row.last_error || '',
    }
  })
}

async function clearCaretakerEstatesRecovery(sql, inspectionId, questionId) {
  await sql.query(
    `DELETE FROM caretaker_estates_action_recovery WHERE inspection_id = $1 AND question_id = $2`,
    [collapse(inspectionId), collapse(questionId)]
  )
}

async function acceptedNotificationAt(sql, actionId, fields) {
  try {
    const current = await sql.query(
      `SELECT notification_sent_at FROM actions WHERE id = $1`,
      [actionId]
    )
    const stored = current?.rows?.[0]?.notification_sent_at
    if (stored) return stored
  } catch (error) {
    console.warn('[caretaker-estates-mailbox-action] notification lookup:', error?.message || error)
  }
  try {
    const logged = await sql.query(
      `SELECT sent_at
       FROM outbound_emails
       WHERE inspection_id = $1
         AND question_id = $2
         AND status = 'sent'
         AND email_routing = $3
         AND sent_at IS NOT NULL
       ORDER BY sent_at DESC
       LIMIT 1`,
      [collapse(fields.inspectionId), collapse(fields.questionId), CARETAKER_ESTATES_NOTIFICATION_ROUTING]
    )
    const sentAt = logged?.rows?.[0]?.sent_at
    if (!sentAt) return null
    await sql.query(
      `UPDATE actions
       SET notification_sent_at = $2, notification_claim_at = NULL
       WHERE id = $1 AND notification_sent_at IS NULL`,
      [actionId, sentAt]
    )
    return sentAt
  } catch {
    return null
  }
}

async function claimNotificationSend(sql, actionId) {
  const result = await sql.query(
    `UPDATE actions
     SET notification_claim_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND notification_sent_at IS NULL
       AND (
         notification_claim_at IS NULL
         OR notification_claim_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'
       )
     RETURNING id`,
    [actionId]
  )
  return Boolean(result?.rows?.[0])
}

async function recordNotificationAccepted(sql, actionId, acceptedAt) {
  await sql.query(
    `UPDATE actions
     SET notification_sent_at = $2, notification_claim_at = NULL
     WHERE id = $1`,
    [actionId, acceptedAt]
  )
}

async function releaseNotificationClaim(sql, actionId) {
  await sql.query(
    `UPDATE actions
     SET notification_claim_at = NULL
     WHERE id = $1 AND notification_sent_at IS NULL`,
    [actionId]
  )
}

/**
 * Save the action, then ask the email provider to accept the notification.
 * Notification sent is recorded only after the provider accepts it.
 * If the action cannot be saved, the notification is not sent. The question is
 * queued and a later submit of the same inspection finishes it once.
 */
export async function deliverCaretakerEstatesMailboxNotification(sql, fields = {}, deps = {}) {
  const sendEmail = deps.sendEmail || sendAppEmail
  const ensureTracking = deps.ensureTracking || ensureCaretakerActionTrackingFields
  await ensureTracking(sql)

  let action = null
  try {
    action = await ensureCaretakerEstatesMailboxAction(sql, fields, deps)
  } catch (error) {
    const message = error?.message || String(error)
    console.warn('[caretaker-estates-mailbox-action] action was not saved:', message)
    try {
      await queueCaretakerEstatesRecovery(sql, fields, 'action_pending', message)
    } catch (queueError) {
      console.warn('[caretaker-estates-mailbox-action] recovery queue:', queueError?.message || queueError)
    }
    return {
      actionSaved: false,
      sent: false,
      failed: true,
      skipped: false,
      warning: caretakerEstatesActionFailureWarning(fields.questionText),
      error: 'action_not_saved',
    }
  }

  if (!action?.id) {
    try {
      await queueCaretakerEstatesRecovery(sql, fields, 'action_pending', 'action_not_saved')
    } catch {
      // The warning still tells the submitter to retry.
    }
    return {
      actionSaved: false,
      sent: false,
      failed: true,
      skipped: false,
      warning: caretakerEstatesActionFailureWarning(fields.questionText),
      error: 'action_not_saved',
    }
  }

  const content = buildCaretakerEstatesMailboxNotification({
    ...fields,
    actionReference: action.issueReference,
    actionUrl: action.actionUrl,
  })
  const queued = await readQueuedRecovery(sql, fields.inspectionId, fields.questionId).catch(() => null)
  const queuedAcceptedAt = queued?.stage === 'provider_accepted' ? queued.payload?.providerAcceptedAt : null
  if (queuedAcceptedAt) {
    try {
      await recordNotificationAccepted(sql, action.id, new Date(queuedAcceptedAt))
      await clearCaretakerEstatesRecovery(sql, fields.inspectionId, fields.questionId)
    } catch (stampError) {
      console.warn('[caretaker-estates-mailbox-action] saved acceptance stamp:', stampError?.message || stampError)
    }
    return {
      actionSaved: true,
      sent: false,
      failed: false,
      skipped: true,
      actionId: action.id,
      content,
    }
  }
  const alreadyAccepted = action.notificationSentAt || await acceptedNotificationAt(sql, action.id, fields)
  if (alreadyAccepted) {
    try {
      await clearCaretakerEstatesRecovery(sql, fields.inspectionId, fields.questionId)
    } catch {
      // The action already records that the provider accepted the notification.
    }
    return {
      actionSaved: true,
      sent: false,
      failed: false,
      skipped: true,
      actionId: action.id,
      content,
    }
  }

  try {
    await queueCaretakerEstatesRecovery(sql, fields, 'notification_pending', null)
  } catch (queueError) {
    console.warn('[caretaker-estates-mailbox-action] recovery queue:', queueError?.message || queueError)
  }

  const claimed = await claimNotificationSend(sql, action.id)
  if (!claimed) {
    return {
      actionSaved: true,
      sent: false,
      failed: false,
      skipped: true,
      actionId: action.id,
      content,
    }
  }

  let sendResult
  try {
    sendResult = await sendEmail({
      to: CARETAKER_ESTATES_MAILBOX_EMAIL,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
  } catch (error) {
    sendResult = { ok: false, error: error?.message || String(error) }
  }

  if (sendResult?.ok) {
    const acceptedAt = new Date()
    let acceptanceQueued = false
    try {
      await queueCaretakerEstatesRecovery(sql, fields, 'provider_accepted', null, {
        providerAcceptedAt: acceptedAt.toISOString(),
        providerMessageId: sendResult.id || null,
      })
      acceptanceQueued = true
    } catch (queueError) {
      console.warn('[caretaker-estates-mailbox-action] acceptance queue:', queueError?.message || queueError)
    }
    let stamped = false
    try {
      await recordNotificationAccepted(sql, action.id, acceptedAt)
      stamped = true
    } catch (stampError) {
      console.warn('[caretaker-estates-mailbox-action] notification stamp:', stampError?.message || stampError)
    }
    let outboundLogged = false
    try {
      const logged = await insertOutboundEmailLog(sql, {
        inspectionId: collapse(fields.inspectionId),
        questionId: collapse(fields.questionId),
        actionId: action.id,
        emailTo: CARETAKER_ESTATES_MAILBOX_EMAIL,
        emailRouting: CARETAKER_ESTATES_NOTIFICATION_ROUTING,
        status: 'sent',
        sentAt: acceptedAt,
        provider: sendResult.provider || null,
        providerMessageId: sendResult.id || null,
      })
      outboundLogged = logged?.ok === true
    } catch (logError) {
      console.warn('[caretaker-estates-mailbox-action] acceptance log:', logError?.message || logError)
    }
    if (stamped) {
      try {
        await clearCaretakerEstatesRecovery(sql, fields.inspectionId, fields.questionId)
      } catch {
        // The action already has Notification sent, so a retry will not send again.
      }
    }
    return {
      actionSaved: true,
      sent: true,
      failed: false,
      skipped: false,
      actionId: action.id,
      notificationSentAt: stamped ? acceptedAt : null,
      provider: sendResult.provider || null,
      providerMessageId: sendResult.id || null,
      outboundLogged,
      acceptanceQueued,
      content,
      warning: stamped
        ? ''
        : acceptanceQueued || outboundLogged
          ? 'The email provider accepted the notification. Notification sent could not be saved on the action. The acceptance was kept, so a retry will not send it again.'
          : 'The email provider accepted the notification, but the acceptance could not be saved. A retry within two minutes will not send it again. After that, check the mailbox before using Retry Estate Services notification, because the email may already have been accepted.',
    }
  }

  try {
    await releaseNotificationClaim(sql, action.id)
  } catch {
    // The claim expires after two minutes so a later retry can send once.
  }
  return {
    actionSaved: true,
    sent: false,
    failed: true,
    skipped: false,
    actionId: action.id,
    warning: caretakerEstatesNotificationFailureWarning(fields.questionText, action.issueReference),
    error: sendResult?.error || 'send_failed',
    content,
  }
}

/**
 * Finish Estate Services photo actions that were queued because the action
 * could not be saved or the provider did not accept the notification.
 * Inspections with no queued row are left unchanged.
 */
export async function recoverCaretakerEstatesMailboxNotifications(sql, inspectionId, deps = {}) {
  const ensureTracking = deps.ensureTracking || ensureCaretakerActionTrackingFields
  await ensureTracking(sql)
  const id = collapse(inspectionId)
  if (!id) return { sent: 0, failed: [], warnings: [], skipped: 0 }
  let pending = []
  try {
    const result = await sql.query(
      `SELECT question_id, payload
       FROM caretaker_estates_action_recovery
       WHERE inspection_id = $1
       ORDER BY question_id`,
      [id]
    )
    pending = result?.rows || []
  } catch (error) {
    return {
      sent: 0,
      failed: [],
      warnings: [`Estate Services retry could not be read: ${error?.message || String(error)}`],
    }
  }

  const warnings = []
  const failed = []
  let sent = 0
  let skipped = 0
  for (const row of pending) {
    const payload = readPayload(row.payload)
    const delivery = await deliverCaretakerEstatesMailboxNotification(sql, {
      ...payload,
      inspectionId: id,
      questionId: row.question_id || payload.questionId,
    }, deps)
    if (delivery.warning) warnings.push(delivery.warning)
    if (delivery.sent) sent += 1
    else if (delivery.skipped) skipped += 1
    else if (delivery.failed) {
      failed.push({
        question: payload.questionText || row.question_id,
        error: delivery.error || 'not_sent',
      })
    }
  }
  return { sent, failed, warnings, skipped }
}
