import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { createHash } from 'crypto'
import { ensureDatabase, ensureInspectionTimingFields, getPgUrl, getNeonQuery } from '@/lib/db'
import { getTemplatesNested } from '@/lib/airtable-client'
import { getCurrentUserEmail, getCurrentUserName, isAdmin } from '@/lib/auth'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import { generatePosterPdfBuffer } from '../../../lib/poster-pdf'
import { uploadInspectionPdfToBlob } from '@/lib/blob/uploadPdf'
import { validateInspectionEstateAndBlock } from '@/lib/validate-inspection-estate-block'
import { deriveInspectionGrading } from '@/lib/deriveInspectionGrading'
import { isCaretakerTemplate } from '@/lib/caretaker-template'
import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'
import {
  isEstateWalkaboutTemplate,
  ESTATE_WALKABOUT_CHECKLIST_QID,
  getCanonicalEstateWalkaboutTemplateForInsert,
} from '@/lib/estate-walkabout-template'
import {
  createEstateWalkaboutActionsFromPayload,
  sendEstateWalkaboutRepairActionNotification,
} from '@/lib/estate-walkabout-actions'
import { createEsmActionsFromPayload } from '@/lib/esm-action-plan-actions'
import {
  tryGenerateAndStoreIssueJobCardPdf,
  formatDateGb,
} from '@/lib/issue-job-card-upload'
import { buildInspectionWhereConditions, joinSqlAnd } from '@/lib/inspection-filters'
import { queryInspectionRowsWithPdfColumnFallback } from '@/lib/inspection-list-query-pdf-fallback'
import {
  getAppRoleContextForClerkUser,
  roleMayCreateAdHocInspection,
  roleMayCreateInspectionWithTemplate,
} from '@/lib/app-role-access'
import { summarizeTemplateSnapshotForDebug } from '@/lib/template-version-debug'
import { isEstateInspectionFormTemplate } from '@/lib/standard-inspection-form'
import { isGroundsMaintenanceTemplate } from '@/lib/grounds-maintenance-template'
import {
  countQuestionsInTemplate,
  logInspectionQuestionPipeline,
} from '@/lib/estate-inspection-question-pipeline-diag'
import {
  normalizeGradeAnswerToken,
  normalizeIssueTriggerToken,
  normalizeYesNoAnswer,
  parseTriggersIssueAnswerList,
} from '@/lib/issue-trigger-answer'
import { getActionTriggerOn } from '@/lib/template-rules'
import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'
import { deriveInspectionWorkType } from '@/lib/inspection-work-types'
import { packNvWizardExtras, unpackNvWizardNotes } from '@/lib/nv-notes-pack'
import { isNeighbourhoodVoiceTemplateVersion } from '@/lib/neighbourhood-voice-question-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WALKABOUT_BULK_REFUSE_QID = 'ew_it_bulk_refuse_removal'
const WALKABOUT_BULK_REFUSE_EMAIL = 'Nick.spenceley@croydon.gov.uk'

const CARETAKER_SECTION_2_EMAIL = 'housingestateservices@croydon.gov.uk'
const CARETAKER_SECTION_2_LOVE_CLEAN_STREETS_EMAIL = 'logged_in_user'
const CARETAKER_SECTION_3_EMAIL = 'Tenancy.Service@croydon.gov.uk'
const CARETAKER_SECTION_5_EMAIL = 'simon.roice@croydon.gov.uk'
const CARETAKER_SECTION_6_EMAIL = 'internalhousingrepairs@croydon.gov.uk'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getAppBaseUrl(request) {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (explicit && String(explicit).trim()) return String(explicit).trim().replace(/\/$/, '')
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl && String(vercelUrl).trim()) return `https://${String(vercelUrl).trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return new URL(request.url).origin.replace(/\/$/, '')
}

function collectPhotoUrlsFromExtras(extras) {
  if (!extras || typeof extras !== 'object') return []
  const urls = Array.isArray(extras.photo_urls)
    ? extras.photo_urls
    : Array.isArray(extras.photoUrls)
      ? extras.photoUrls
      : []
  const singleUrl = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
  return [...(singleUrl ? [singleUrl] : []), ...urls].filter((url) => typeof url === 'string' && url.trim())
}

function collectEsmIdCardPhotoUrls(extras) {
  if (!extras || typeof extras !== 'object') return []
  return Array.isArray(extras.id_card_photo_urls)
    ? extras.id_card_photo_urls.filter((url) => typeof url === 'string' && url.trim())
    : []
}

function parseInspectionTimeInput(value) {
  if (value == null || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function operationalInspectionTimes(template, startValue, endValue, { defaultEnd = false } = {}) {
  if (template && isNeighbourhoodVoiceTemplateVersion(template)) {
    return { start: null, end: null }
  }
  const start = parseInspectionTimeInput(startValue)
  const end = parseInspectionTimeInput(endValue) || (defaultEnd ? new Date() : null)
  return { start, end }
}

function getCaretakerSectionNumber(section) {
  const raw = String(section?.title || section?.name || '').trim()
  const match = raw.match(/^(\d+)\s*[.)-]?/)
  return match ? Number(match[1]) : null
}

function getCaretakerQuestionPart(question, index) {
  const key = String(question?.question_key || '')
  const match = key.match(/_q(\d+)$/i)
  const oneBased = match ? Number(match[1]) : index + 1
  return Number.isFinite(oneBased) && oneBased > 0 ? oneBased : index + 1
}

function buildCaretakerNotificationHtml({ inspectionTitle, locationLine, sectionTitle, questionText, answer, comment, photoUrls, reminder = '' }) {
  const photos = photoUrls.length
    ? `<ul>${photoUrls.map((url) => `<li><a href="${escapeHtml(url)}">Photo</a></li>`).join('')}</ul>`
    : '<p>No photo link recorded.</p>'
  return `
    <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
      <h1 style="font-size:18px;">Caretaker inspection notification</h1>
      <p><strong>Inspection:</strong> ${escapeHtml(inspectionTitle || 'Caretaker inspection')}</p>
      ${locationLine ? `<p><strong>Location:</strong> ${escapeHtml(locationLine)}</p>` : ''}
      <p><strong>Section:</strong> ${escapeHtml(sectionTitle || 'Caretaker form')}</p>
      <p><strong>Question:</strong> ${escapeHtml(questionText || '')}</p>
      <p><strong>Answer:</strong> ${escapeHtml(answer || '—')}</p>
      ${comment ? `<p><strong>Comment:</strong> ${escapeHtml(comment)}</p>` : ''}
      ${reminder ? `<p>${escapeHtml(reminder)}</p>` : ''}
      <p><strong>Photos:</strong></p>
      ${photos}
    </div>
  `
}

function collectCaretakerEmailNotifications({ template, answers, answerExtras, inspectorEmail }) {
  if (!isCaretakerTemplate(template)) return []
  const notifications = []
  for (const section of template.sections || []) {
    const sectionNo = getCaretakerSectionNumber(section)
    const questions = section.questions || []
    questions.forEach((q, index) => {
      if (!q?.id) return
      const extras = answerExtras[q.id] || {}
      const photoUrls = collectPhotoUrlsFromExtras(extras)
      const answer = answers[q.id]
      const isYes = normalizeYesNoAnswer(answer) === 'yes'
      const partNo = getCaretakerQuestionPart(q, index)
      const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
      const questionText = q.question_text || q.label || q.id
      const base = {
        sectionTitle: section.title || section.name || '',
        questionText,
        answer: answer == null ? '' : String(answer),
        comment,
        photoUrls,
      }

      if (sectionNo === 2 && partNo >= 1 && partNo <= 5 && photoUrls.length > 0) {
        notifications.push({ ...base, to: CARETAKER_SECTION_2_EMAIL, routing: 'caretaker_section_2_photo' })
      }
      if (sectionNo === 2 && partNo === 6 && photoUrls.length > 0 && inspectorEmail) {
        notifications.push({
          ...base,
          to: inspectorEmail,
          routing: CARETAKER_SECTION_2_LOVE_CLEAN_STREETS_EMAIL,
          reminder: 'Please report this issue via the Love Clean Streets app.',
        })
      }
      if (sectionNo === 4 && isYes) {
        notifications.push({ ...base, to: CARETAKER_SECTION_3_EMAIL, routing: 'caretaker_section_3_yes' })
      }
      if (sectionNo === 6 && isYes) {
        notifications.push({ ...base, to: CARETAKER_SECTION_5_EMAIL, routing: 'caretaker_section_5_yes' })
      }
      if (sectionNo === 7 && isYes) {
        notifications.push({ ...base, to: CARETAKER_SECTION_6_EMAIL, routing: 'caretaker_section_6_yes' })
      }
    })
  }
  return notifications
}

function collectEsmEmailNotifications({ template, answers, answerExtras }) {
  if (!isEsmInspectionFormTemplate(template)) return []
  const notifications = []
  for (const section of template.sections || []) {
    for (const q of section.questions || []) {
      if (!q?.id) continue
      const extras = answerExtras[q.id] || {}
      const photoUrls = collectPhotoUrlsFromExtras(extras)
      const idCardPhotoUrls = collectEsmIdCardPhotoUrls(extras)
      const answer = answers[q.id]
      const isYes = normalizeYesNoAnswer(answer) === 'yes'
      const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
      const selectedRecipient = typeof extras.recipient_person_id === 'string' ? extras.recipient_person_id.trim() : ''
      const base = {
        sectionTitle: section.title || section.name || '',
        questionText: q.question_text || q.label || q.id,
        answer: answer == null ? '' : String(answer),
        comment,
        photoUrls: [...photoUrls, ...idCardPhotoUrls],
      }

      if (q.esm_recipient_on_yes === true && isYes && selectedRecipient) {
        notifications.push({ ...base, to: selectedRecipient, routing: 'esm_graffiti_selected_recipient' })
      }
      if (q.esm_email_on_photo_to_selected_recipient === true && photoUrls.length > 0 && selectedRecipient) {
        notifications.push({ ...base, to: selectedRecipient, routing: `esm_${q.esm_behavior || 'photo'}_selected_recipient_photo` })
      }
      if (q.esm_email_on_yes && isYes) {
        notifications.push({ ...base, to: String(q.esm_email_on_yes), routing: `esm_${q.esm_behavior || 'yes'}_yes` })
      }
      if (q.esm_email_on_comment_or_issue && (comment || isYes)) {
        notifications.push({ ...base, to: String(q.esm_email_on_comment_or_issue), routing: `esm_${q.esm_behavior || 'comment'}_comment` })
      }
      if (q.esm_email_on_photo_and_comment && photoUrls.length > 0 && comment) {
        notifications.push({ ...base, to: String(q.esm_email_on_photo_and_comment), routing: `esm_${q.esm_behavior || 'photo_comment'}_photo_comment` })
      }
      if (q.esm_email_on_photo && photoUrls.length > 0) {
        notifications.push({ ...base, to: String(q.esm_email_on_photo), routing: `esm_${q.esm_behavior || 'photo'}_photo` })
      }
    }
  }
  return notifications
}

async function sendEsmEmailNotifications(sqlFn, { inspectionId, inspectionTitle, locationLine, notifications }) {
  const result = { sent: 0, failed: [] }
  const dedupe = new Set()
  for (const notification of notifications || []) {
    const to = String(notification.to || '').trim()
    if (!to) continue
    const dedupeKey = `${to}|${notification.routing}|${notification.questionText}`
    if (dedupe.has(dedupeKey)) continue
    dedupe.add(dedupeKey)
    const photos = Array.isArray(notification.photoUrls) && notification.photoUrls.length
      ? `<ul>${notification.photoUrls.map((url) => `<li><a href="${escapeHtml(url)}">Photo</a></li>`).join('')}</ul>`
      : '<p>No photo link recorded.</p>'
    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
        <h1 style="font-size:18px;">ESM inspection notification</h1>
        <p><strong>Inspection:</strong> ${escapeHtml(inspectionTitle || 'ESM inspection')}</p>
        ${locationLine ? `<p><strong>Location:</strong> ${escapeHtml(locationLine)}</p>` : ''}
        <p><strong>Section:</strong> ${escapeHtml(notification.sectionTitle || 'ESM form')}</p>
        <p><strong>Question:</strong> ${escapeHtml(notification.questionText || '')}</p>
        <p><strong>Answer:</strong> ${escapeHtml(notification.answer || '—')}</p>
        ${notification.comment ? `<p><strong>Comment:</strong> ${escapeHtml(notification.comment)}</p>` : ''}
        <p><strong>Photos:</strong></p>
        ${photos}
      </div>
    `
    const text = [
      'ESM inspection notification',
      locationLine ? `Location: ${locationLine}` : '',
      notification.sectionTitle ? `Section: ${notification.sectionTitle}` : '',
      notification.questionText ? `Question: ${notification.questionText}` : '',
      notification.answer ? `Answer: ${notification.answer}` : '',
      notification.comment ? `Comment: ${notification.comment}` : '',
      ...(notification.photoUrls || []),
    ].filter(Boolean).join('\n')
    try {
      const sendResult = await sendAppEmail({
        to,
        subject: `ESM inspection: ${notification.sectionTitle || locationLine || inspectionTitle || 'notification'}`,
        html,
        text,
      })
      if (sendResult.ok) {
        result.sent += 1
        await insertOutboundEmailLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: to,
          emailRouting: notification.routing || 'esm_notification',
          status: 'sent',
          sentAt: new Date(),
        })
      } else {
        result.failed.push({ email: to, error: sendResult.error || 'send_failed' })
      }
    } catch (error) {
      result.failed.push({ email: to, error: error?.message || String(error) })
    }
  }
  return result
}

async function sendCaretakerEmailNotifications(sqlFn, { inspectionId, inspectionTitle, locationLine, notifications }) {
  const result = { sent: 0, failed: [] }
  const dedupe = new Set()
  for (const notification of notifications || []) {
    const to = String(notification.to || '').trim()
    if (!to) continue
    const dedupeKey = `${to}|${notification.routing}|${notification.questionText}`
    if (dedupe.has(dedupeKey)) continue
    dedupe.add(dedupeKey)
    const html = buildCaretakerNotificationHtml({
      inspectionTitle,
      locationLine,
      sectionTitle: notification.sectionTitle,
      questionText: notification.questionText,
      answer: notification.answer,
      comment: notification.comment,
      photoUrls: notification.photoUrls || [],
      reminder: notification.reminder || '',
    })
    const text = [
      'Caretaker inspection notification',
      locationLine ? `Location: ${locationLine}` : '',
      notification.sectionTitle ? `Section: ${notification.sectionTitle}` : '',
      notification.questionText ? `Question: ${notification.questionText}` : '',
      notification.answer ? `Answer: ${notification.answer}` : '',
      notification.comment ? `Comment: ${notification.comment}` : '',
      notification.reminder || '',
      ...(notification.photoUrls || []),
    ].filter(Boolean).join('\n')
    try {
      const sendResult = await sendAppEmail({
        to,
        subject: `Caretaker inspection: ${notification.sectionTitle || locationLine || inspectionTitle || 'notification'}`,
        html,
        text,
      })
      if (sendResult.ok) {
        result.sent += 1
        await insertOutboundEmailLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: to,
          emailRouting: notification.routing || 'caretaker_notification',
          status: 'sent',
          sentAt: new Date(),
        })
      } else {
        result.failed.push({ email: to, error: sendResult.error || 'send_failed' })
        await insertOutboundEmailLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: to,
          emailRouting: `${notification.routing || 'caretaker_notification'}:${sendResult.error || 'failed'}`,
          status: 'failed',
          sentAt: null,
        })
      }
    } catch (error) {
      result.failed.push({ email: to, error: error?.message || String(error) })
      try {
        await insertOutboundEmailLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: to,
          emailRouting: `${notification.routing || 'caretaker_notification'}:${error?.message || 'error'}`,
          status: 'failed',
          sentAt: null,
        })
      } catch {
        // best-effort audit only
      }
    }
  }
  return result
}

function collectBulkRefusePhotoUrls({ answerExtras = {}, answers = {} }) {
  const direct = collectPhotoUrlsFromExtras(answerExtras[WALKABOUT_BULK_REFUSE_QID])
  const checklist = (() => {
    try {
      const parsed = JSON.parse(String(answers[ESTATE_WALKABOUT_CHECKLIST_QID] || '[]'))
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((item) => /bulk\s+refuse/i.test(`${item?.description || ''} ${item?.action_summary || ''}`))
        .flatMap((item) => (Array.isArray(item?.photo_urls) ? item.photo_urls : []))
        .filter((url) => typeof url === 'string' && url.trim())
    } catch {
      return []
    }
  })()
  return Array.from(new Set([...direct, ...checklist]))
}

function parseDueDateInput(raw) {
  if (raw == null || raw === '') return null
  const d = raw instanceof Date ? raw : new Date(typeof raw === 'string' ? raw : String(raw))
  return Number.isNaN(d.getTime()) ? null : d
}

function mapSnapshotQuestion(q, qIndex) {
  return {
    id: q.id,
    question_key: q.question_key ?? q.id,
    order: q.order ?? qIndex + 1,
    sort_order: q.sort_order ?? q.order ?? qIndex + 1,
    label: q.label ?? q.question_text ?? null,
    question_text: q.question_text ?? q.label,
    resident_wording: q.resident_wording ?? null,
    helper_text: q.helper_text ?? null,
    instructions: q.instructions ?? null,
    question_type: q.question_type ?? null,
    question_type_raw: q.question_type_raw ?? null,
    answer_mode: q.answer_mode ?? q.question_type ?? null,
    options: q.options ?? null,
    grading_scheme_name: q.grading_scheme_name ?? null,
    grading_options: q.grading_options ?? null,
    comment_required_when: q.comment_required_when ?? null,
    photo_required_when: q.photo_required_when ?? null,
    type_includes_photo: q.type_includes_photo ?? false,
    include_photo: !!(q.include_photo ?? false),
    is_required: q.is_required ?? false,
    category: q.category ?? null,
    action_category: q.action_category ?? q.category ?? null,
    create_action_on_yes: q.create_action_on_yes,
    create_action_on_no: q.create_action_on_no ?? true,
    esm_q4_abandoned_vehicle: q.esm_q4_abandoned_vehicle ?? false,
    esm_behavior: q.esm_behavior ?? null,
    esm_comment_always: q.esm_comment_always ?? false,
    esm_comment_label: q.esm_comment_label ?? null,
    esm_comment_helper: q.esm_comment_helper ?? null,
    esm_comment_on_photo: q.esm_comment_on_photo ?? false,
    esm_confirmation_message: q.esm_confirmation_message ?? null,
    esm_dual_photo_upload: q.esm_dual_photo_upload ?? false,
    esm_recipient_on_yes: q.esm_recipient_on_yes ?? false,
    esm_recipient_on_photo: q.esm_recipient_on_photo ?? false,
    esm_use_people_recipients: q.esm_use_people_recipients ?? false,
    esm_recipient_label: q.esm_recipient_label ?? null,
    esm_recipient_helper: q.esm_recipient_helper ?? null,
    esm_recipient_options: q.esm_recipient_options ?? null,
    esm_email_on_photo_to_selected_recipient: q.esm_email_on_photo_to_selected_recipient ?? false,
    esm_email_on_yes: q.esm_email_on_yes ?? null,
    esm_email_on_photo: q.esm_email_on_photo ?? null,
    esm_email_on_photo_and_comment: q.esm_email_on_photo_and_comment ?? null,
    esm_email_on_comment_or_issue: q.esm_email_on_comment_or_issue ?? null,
    esm_missing_email_warning: q.esm_missing_email_warning ?? null,
    require_comment_on_yes: q.require_comment_on_yes ?? false,
    require_comment_on_no: q.require_comment_on_no ?? true,
    require_photo_on_yes: q.require_photo_on_yes ?? false,
    require_photo_on_no: q.require_photo_on_no ?? true,
    caretaker_comment_on_photo: q.caretaker_comment_on_photo ?? false,
    caretaker_comment_on_yes: q.caretaker_comment_on_yes ?? false,
    caretaker_photo_on_yes: q.caretaker_photo_on_yes ?? false,
    caretaker_photo_always: q.caretaker_photo_always ?? true,
    caretaker_simple_photo_capture: q.caretaker_simple_photo_capture ?? false,
    caretaker_recipient_on_yes: q.caretaker_recipient_on_yes ?? false,
    caretaker_recipient_options: q.caretaker_recipient_options ?? null,
    caretaker_recipient_always: q.caretaker_recipient_always ?? false,
    action_recipient_required_when: q.action_recipient_required_when ?? null,
    triggers_issue_answer:
      q.triggers_issue_answer ?? q.triggers_issue_answers ?? q.issue_trigger_answers ?? null,
    action_trigger_on: q.action_trigger_on ?? q.issue_triggers_on ?? null,
    issue_triggers_on: q.issue_triggers_on ?? null,
    triggers_task: q.triggers_task ?? false,
    triggers_email: q.triggers_email ?? false,
    email_routing: q.email_routing ?? null,
    email_route_team_id: q.email_route_team_id ?? null,
    issue_type: q.issue_type ?? null,
    programme_tag: q.programme_tag ?? null,
    depends_on_question_id: q.depends_on_question_id ?? null,
    show_when_value: q.show_when_value ?? null,
  }
}

function inspectionAnswerTriggersIssue(question, section, answer) {
  const triggers = parseTriggersIssueAnswerList(question)
  if (triggers && triggers.length > 0) {
    const token = normalizeIssueTriggerToken(answer) || normalizeGradeAnswerToken(answer)
    return token ? triggers.includes(token) : false
  }

  const norm = normalizeYesNoAnswer(answer)
  const direction = getActionTriggerOn(question, section)
  if (direction === 'yes') return norm === 'yes' && question.create_action_on_yes !== false
  return norm === 'no' && question.create_action_on_no !== false
}

function safeActionText(value, fallback, maxLength) {
  const text = String(value || fallback || '').trim()
  const safe = text || String(fallback || 'Inspection action')
  return maxLength && safe.length > maxLength ? safe.slice(0, maxLength) : safe
}

function answerValueFromRow(row) {
  if (!row) return ''
  if (row.answer_value != null && String(row.answer_value).trim() !== '') return String(row.answer_value)
  if (row.answer_text != null && String(row.answer_text).trim() !== '') return String(row.answer_text)
  if (row.answer_boolean != null) return row.answer_boolean ? 'Yes' : 'No'
  if (row.answer_number != null) return String(row.answer_number)
  return ''
}

function safeParseJsonArray(raw) {
  if (Array.isArray(raw)) return raw
  const text = raw == null ? '' : String(raw).trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function countResponseIssueSignals(templateVersion, answerRows) {
  if (!templateVersion || typeof templateVersion !== 'object') return { count: 0, questionIds: [] }

  const answersByQuestionId = new Map(
    (answerRows || [])
      .map((row) => [String(row.question_id || ''), row])
      .filter(([questionId]) => questionId)
  )
  const questionIds = new Set()

  for (const row of answerRows || []) {
    if (row.question_id !== ESTATE_WALKABOUT_CHECKLIST_QID) continue
    const checklistItems = safeParseJsonArray(row.answer_text ?? row.answer_value)
    checklistItems.forEach((item, index) => {
      if (item?.action_required === true || item?.raise_issue === true) {
        questionIds.add(`${ESTATE_WALKABOUT_CHECKLIST_QID}:${item.id || item.item_id || index}`)
      }
    })
  }

  for (const section of templateVersion.sections || []) {
    for (const question of section.questions || []) {
      if (!question?.id) continue
      const answerRow = answersByQuestionId.get(String(question.id))
      if (!answerRow) continue

      const answer = answerValueFromRow(answerRow)
      if (inspectionAnswerTriggersIssue(question, section, answer)) {
        questionIds.add(String(question.id))
      }
      if (String(question.question_type || answerRow.question_type || '').toLowerCase() === 'yes_no') {
        const norm = normalizeYesNoAnswer(answer)
        if (norm === 'no') {
          questionIds.add(`${question.id}:response_no`)
        }
      }

      const { structured } = unpackNvWizardNotes(answerRow.notes)
      if (structured?.raise_issue === true) {
        questionIds.add(`${question.id}:raise_issue`)
      }
      if (question.nv_render_kind === 'nv_standard' && question._nv_issue_category) {
        const grade = String(answer || '').trim().toUpperCase()
        if (grade === 'D' || (grade === 'C' && question._nv_create_issue_on_c)) {
          questionIds.add(`${question.id}:nv_grade`)
        }
      }
      if (question.nv_render_kind === 'nv_issues_report' && structured && typeof structured === 'object') {
        Object.entries(structured).forEach(([key, value]) => {
          if (/yes_no/i.test(key) && String(value || '').trim().toLowerCase() === 'yes') {
            questionIds.add(`${question.id}:${key}`)
          }
        })
      }
    }
  }

  return { count: questionIds.size, questionIds: [...questionIds] }
}

function buildTemplateVersionSnapshot(template) {
  const questionsFlat = []
  const sections = (template.sections || []).map((sec, secIndex) => {
    const mappedQs = (sec.questions || []).map((q, qIndex) => {
      const row = mapSnapshotQuestion(q, qIndex)
      questionsFlat.push({ ...row, section_id: String(sec.id) })
      return row
    })
    return {
      id: sec.id,
      order: sec.order ?? secIndex + 1,
      sort_order: sec.sort_order ?? sec.section_order ?? sec.order ?? secIndex + 1,
      section_order: sec.section_order ?? sec.sort_order ?? sec.order ?? secIndex + 1,
      esm_display_order: sec.esm_display_order ?? null,
      esm_display_number: sec.esm_display_number ?? null,
      title: sec.title ?? sec.name,
      name: sec.name ?? sec.title ?? null,
      help_text: sec.help_text ?? null,
      what_to_look_for: sec.what_to_look_for ?? null,
      questions: mappedQs,
    }
  })
  return {
    id: template.id,
    name: template.name,
    template_key: template.template_key ?? null,
    template_type: template.template_type ?? template.type ?? null,
    sections,
    questions: questionsFlat,
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(stableStringify(snapshot)).digest('hex')
}

async function getOrCreateTemplateVersion(templateId, templateName, snapshot) {
  const versionHash = hashSnapshot(snapshot)
  /** Reuse only when the **most recently created** row for this template_id has the same hash (stableStringify of snapshot). */
  const latest = await sql`
    SELECT id, snapshot, version_hash
    FROM template_versions
    WHERE template_id = ${templateId}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `
  if (latest.rows[0] && latest.rows[0].version_hash === versionHash) {
    return { id: latest.rows[0].id, snapshot: latest.rows[0].snapshot, versionHash, reused: true }
  }

  const versionId = `tv_${templateId}_${Date.now()}_${versionHash.slice(0, 8)}`
  await sql`
    INSERT INTO template_versions (id, template_id, template_name, version_hash, snapshot)
    VALUES (${versionId}, ${templateId}, ${templateName || null}, ${versionHash}, ${JSON.stringify(snapshot)}::jsonb)
  `
  return { id: versionId, snapshot, versionHash, reused: false }
}

async function getActivePersonName(sqlFn, personId) {
  const id = personId != null ? String(personId).trim() : ''
  if (!id) return ''
  try {
    const result = await sqlFn`
      SELECT name FROM people
      WHERE id = ${id}
        AND COALESCE(active, true) = true
      LIMIT 1
    `
    return String(result.rows[0]?.name || '').trim()
  } catch (error) {
    console.warn('[Inspections] Bulk refuse responsible person lookup failed:', error?.message || error)
    return ''
  }
}

async function logBulkRefuseEmail(sqlFn, { inspectionId, status, routing }) {
  try {
    await insertOutboundEmailLog(sqlFn, {
      inspectionId,
      questionId: WALKABOUT_BULK_REFUSE_QID,
      emailTo: WALKABOUT_BULK_REFUSE_EMAIL,
      emailRouting: routing,
      status,
      sentAt: status === 'sent' ? new Date() : null,
    })
  } catch (error) {
    console.warn('[Inspections] Bulk refuse email log failed:', error?.message || error)
  }
}

async function sendBulkRefuseWalkaboutEmail(sqlFn, {
  request,
  inspectionId,
  estateName,
  locationLine,
  answers,
  answerExtras,
  posterPdfUrl,
  submittedAt,
}) {
  if (normalizeYesNoAnswer(answers?.[WALKABOUT_BULK_REFUSE_QID]) !== 'yes') {
    return { sent: 0, failed: [] }
  }

  const dateInspected = answers?.ew_sig_inspection_date || submittedAt || new Date().toISOString()
  const inspectionVisitDate = answers?.ew_q_planned_date || ''
  const responsiblePerson = await getActivePersonName(sqlFn, answers?.ew_q_responsible)
  const role = String(answers?.ew_q_role || '').trim()
  const estateArea = String(answers?.ew_q_area || '').trim()
  const exactLocation = String(answers?.ew_it_bulk_refuse_exact_location || locationLine || estateArea || '').trim()
  const comments = String(answers?.ew_it_bulk_refuse_comments || answers?.ew_it_comments || '').trim()
  const photoUrls = collectBulkRefusePhotoUrls({ answerExtras, answers })
  const baseUrl = getAppBaseUrl(request)
  const inspectionUrl = `${baseUrl}/inspections/${inspectionId}`
  const subject = `Estate Walkabout – Bulk Refuse Removal Required – ${estateName || estateArea || 'Estate'} – ${formatDateGb(dateInspected)}`
  const photoHtml = photoUrls.length
    ? `<ul>${photoUrls.map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`).join('')}</ul>`
    : '<p>No photo link was provided for this question.</p>'
  const posterHtml = posterPdfUrl
    ? `<li>Action plan / poster: <a href="${escapeHtml(posterPdfUrl)}">${escapeHtml(posterPdfUrl)}</a></li>`
    : '<li>Action plan / poster: Not generated</li>'
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
      <p>Hello,</p>
      <p>A bulk refuse removal has been identified during an Estate Walkabout.</p>
      <h2 style="font-size:16px">Inspection details</h2>
      <ul>
        <li>Estate / Area: ${escapeHtml(estateArea || '—')}</li>
        <li>Block / Location: ${escapeHtml(locationLine || '—')}</li>
        <li>Ward: —</li>
        <li>Date inspected: ${escapeHtml(formatDateGb(dateInspected) || '—')}</li>
        <li>Inspection visit date: ${escapeHtml(formatDateGb(inspectionVisitDate) || inspectionVisitDate || '—')}</li>
        <li>Responsible person: ${escapeHtml(responsiblePerson || '—')}</li>
        <li>Role: ${escapeHtml(role || '—')}</li>
      </ul>
      <h2 style="font-size:16px">Issue raised</h2>
      <ul>
        <li>Bulk refuse removal required: Yes</li>
        <li>Exact location: ${escapeHtml(exactLocation || '—')}</li>
        <li>Comments entered by inspector: ${escapeHtml(comments || '—')}</li>
      </ul>
      <p><strong>Photo attached or link to photo(s):</strong></p>
      ${photoHtml}
      <h2 style="font-size:16px">Actions</h2>
      <p>Please arrange removal and update works/order reference if raised.</p>
      <h2 style="font-size:16px">System links</h2>
      <ul>
        <li>Inspection record: <a href="${escapeHtml(inspectionUrl)}">${escapeHtml(inspectionUrl)}</a></li>
        ${posterHtml}
      </ul>
      <p>Thank you.</p>
    </div>
  `
  const text = [
    'Hello,',
    '',
    'A bulk refuse removal has been identified during an Estate Walkabout.',
    '',
    'Inspection details:',
    `- Estate / Area: ${estateArea || '—'}`,
    `- Block / Location: ${locationLine || '—'}`,
    '- Ward: —',
    `- Date inspected: ${formatDateGb(dateInspected) || '—'}`,
    `- Inspection visit date: ${formatDateGb(inspectionVisitDate) || inspectionVisitDate || '—'}`,
    `- Responsible person: ${responsiblePerson || '—'}`,
    `- Role: ${role || '—'}`,
    '',
    'Issue raised:',
    '- Bulk refuse removal required: Yes',
    `- Exact location: ${exactLocation || '—'}`,
    `- Comments entered by inspector: ${comments || '—'}`,
    `- Photo attached or link to photo(s): ${photoUrls.length ? photoUrls.join('; ') : 'No photo link was provided for this question.'}`,
    '',
    'Actions:',
    'Please arrange removal and update works/order reference if raised.',
    '',
    'System links:',
    `- Inspection record link: ${inspectionUrl}`,
    `- Action plan / poster link: ${posterPdfUrl || 'Not generated'}`,
    '',
    'Thank you.',
  ].join('\n')

  const result = await sendAppEmail({
    to: WALKABOUT_BULK_REFUSE_EMAIL,
    subject,
    html,
    text,
  })
  if (result.ok) {
    await logBulkRefuseEmail(sqlFn, {
      inspectionId,
      status: 'sent',
      routing: 'estate_walkabout_bulk_refuse',
    })
    return { sent: 1, failed: [] }
  }
  await logBulkRefuseEmail(sqlFn, {
    inspectionId,
    status: 'failed',
    routing: `estate_walkabout_bulk_refuse:${result.error || 'send_failed'}`,
  })
  return {
    sent: 0,
    failed: [{ email: WALKABOUT_BULK_REFUSE_EMAIL, error: result.error || 'send_failed' }],
  }
}

export async function GET(request) {
  const { userId } = await auth()
  console.log('auth userId', userId)
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const userEmail = await getCurrentUserEmail()
    const clerkAdmin = await isAdmin()
    // Align with /api/dashboard: owner|admin|esm (and Clerk admin) see all rows.
    let postgresListAll = false
    try {
      const roleRow = await sql`
        SELECT lower(trim(CASE
          WHEN lower(trim(COALESCE(role, ''))) = 'owner' THEN 'owner'
          WHEN lower(trim(COALESCE(system_role, role, ''))) = 'admin' THEN 'admin'
          ELSE 'user'
        END)) AS r
        FROM users
        WHERE clerk_user_id = ${userId}
        LIMIT 1
      `
      const r = roleRow.rows[0]?.r || ''
      postgresListAll = r === 'owner' || r === 'admin' || r === 'esm'
    } catch {
      postgresListAll = false
    }
    const canListAll = clerkAdmin || postgresListAll
    const { searchParams } = new URL(request.url)

    const whereConditions = buildInspectionWhereConditions({
      completionScope: searchParams.get('completionScope') || 'active',
      dateField: searchParams.get('dateField') || null,
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
      locationSearch: searchParams.get('search') || '',
      admin: canListAll,
    })
    const [whereText, whereParams] = joinSqlAnd(whereConditions)
    const limit = canListAll ? 200 : 100
    const limitPlaceholder = whereParams.length + 1
    const listPdfFragments = [
      'i.pdf_url, i.full_pdf_url, i.poster_pdf_url, i.pdf_generation_error',
      'i.pdf_url, i.full_pdf_url, i.poster_pdf_url',
      'i.pdf_url, i.full_pdf_url',
      'i.pdf_url',
    ]
    const rows = await queryInspectionRowsWithPdfColumnFallback(
      getNeonQuery(),
      listPdfFragments,
      (pdfCols) =>
        `SELECT i.id, i.type, i.work_type, i.location_label, i.inspector_name, i.inspector_id, i.template_id, i.template_name,
             i.due_date, i.submitted_at, i.grading, ${pdfCols},
             CASE
               WHEN i.submitted_at IS NOT NULL OR lower(trim(COALESCE(i.status, ''))) = 'submitted' THEN 'submitted'
               WHEN lower(trim(COALESCE(i.status, ''))) IN ('completed', 'complete') THEN 'completed'
               WHEN NULLIF(trim(COALESCE(i.status, '')), '') IS NOT NULL THEN lower(trim(i.status))
               ELSE 'draft'
             END AS status,
             i.status AS raw_status,
             i.is_scheduled, i.title, i.source, i.description, i.created_at, i.updated_at,
             e.name AS estate_name, b.name AS block_name
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE ${whereText}
      ORDER BY i.submitted_at DESC NULLS LAST, i.created_at DESC
      LIMIT $${limitPlaceholder}`,
      [...whereParams, limit]
    )
    const inspectionIds = rows.map((row) => String(row.id || '').trim()).filter(Boolean)
    let rowsWithActionCounts = rows.map((row) => ({
      ...row,
      issues_count: 0,
      open_issues_count: 0,
    }))

    if (inspectionIds.length > 0) {
      const actionCountPlaceholders = inspectionIds.map((_, idx) => `$${idx + 1}`).join(', ')
      const actionCountsResult = await getNeonQuery()(
        `SELECT
           a.inspection_id::text AS inspection_id,
           COUNT(*)::int AS issues_count,
           COUNT(*) FILTER (
             WHERE lower(trim(COALESCE(a.status, ''))) IN ('open', 'in progress', 'in_progress')
           )::int AS open_issues_count,
           ARRAY_REMOVE(ARRAY_AGG(a.id ORDER BY a.created_at DESC), NULL) AS action_ids,
           ARRAY_REMOVE(ARRAY_AGG(a.inspection_id::text ORDER BY a.created_at DESC), NULL) AS action_inspection_refs
         FROM actions a
         WHERE a.inspection_id::text IN (${actionCountPlaceholders})
         GROUP BY a.inspection_id::text`,
        inspectionIds
      )
      const countsByInspectionId = new Map(
        (actionCountsResult.rows || []).map((row) => [String(row.inspection_id), row])
      )
      const inspectionDetailsResult = await getNeonQuery()(
        `SELECT id::text AS id, template_version
         FROM inspections
         WHERE id::text IN (${actionCountPlaceholders})`,
        inspectionIds
      )
      const answerRowsResult = await getNeonQuery()(
        `SELECT inspection_id::text AS inspection_id, question_id, section_id, question_type,
                answer_value, answer_text, answer_number, answer_boolean, notes
         FROM inspection_answers
         WHERE inspection_id::text IN (${actionCountPlaceholders})
         ORDER BY section_id, question_id`,
        inspectionIds
      )
      const answersByInspectionId = new Map()
      for (const answerRow of answerRowsResult.rows || []) {
        const key = String(answerRow.inspection_id)
        if (!answersByInspectionId.has(key)) answersByInspectionId.set(key, [])
        answersByInspectionId.get(key).push(answerRow)
      }
      const responseCountsByInspectionId = new Map()
      for (const detailRow of inspectionDetailsResult.rows || []) {
        let templateVersion = detailRow.template_version
        if (typeof templateVersion === 'string') {
          try {
            templateVersion = JSON.parse(templateVersion)
          } catch {
            templateVersion = null
          }
        }
        responseCountsByInspectionId.set(
          String(detailRow.id),
          countResponseIssueSignals(templateVersion, answersByInspectionId.get(String(detailRow.id)) || [])
        )
      }
      rowsWithActionCounts = rows.map((row) => {
        const counts = countsByInspectionId.get(String(row.id))
        const responseCounts = responseCountsByInspectionId.get(String(row.id)) || { count: 0, questionIds: [] }
        const actionTotal = Number(counts?.issues_count) || 0
        const actionOpen = Number(counts?.open_issues_count) || 0
        const responseTotal = Number(responseCounts.count) || 0
        const totalIssues = Math.max(actionTotal, responseTotal)
        return {
          ...row,
          issue_count: totalIssues,
          issues_count: totalIssues,
          action_count: actionTotal,
          response_issue_count: responseTotal,
          open_issues_count: actionTotal > 0 ? Math.max(actionOpen, responseTotal) : responseTotal,
        }
      })

      const sampleInspection =
        rows.find((row) => {
          const counts = countsByInspectionId.get(String(row.id))
          const responseCounts = responseCountsByInspectionId.get(String(row.id))
          return (Number(counts?.issues_count) || 0) === 0 && (Number(responseCounts?.count) || 0) > 0
        }) ||
        rows.find((row) => countsByInspectionId.has(String(row.id))) ||
        rows[0]
      const sampleCounts = sampleInspection
        ? countsByInspectionId.get(String(sampleInspection.id))
        : null
      const sampleResponseCounts = sampleInspection
        ? responseCountsByInspectionId.get(String(sampleInspection.id))
        : null
      const sampleDisplayedRow = sampleInspection
        ? rowsWithActionCounts.find((row) => String(row.id) === String(sampleInspection.id))
        : null
      console.log('[inspections list] issue count trace', {
        inspection_id: sampleInspection?.id || null,
        matching_action_ids: sampleCounts?.action_ids || [],
        action_inspection_refs: sampleCounts?.action_inspection_refs || [],
        response_issue_question_ids: sampleResponseCounts?.questionIds || [],
        response_issue_count: sampleResponseCounts?.count || 0,
        table_issues_count: sampleDisplayedRow?.issues_count ?? 0,
      })
    }

    return NextResponse.json(rowsWithActionCounts)
  } catch (error) {
    console.error('Error listing inspections:', error)
    return NextResponse.json(
      { error: 'Failed to list inspections', details: error?.message },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  const { userId } = await auth()
  console.log('auth userId', userId)
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body && body.test === true) {
    return NextResponse.json({
      ok: true,
      message: 'POST /api/inspections reachable',
      userId,
    })
  }

  const {
    template_id,
    title,
    location,
    description,
    due_date,
    estate_id: bodyEstateId,
    block_id: bodyBlockId,
    answers = {},
    answer_extras = {},
    draft: createDraft,
    inspection_start_time,
    inspection_end_time,
  } = body

  const dueDateParsed = parseDueDateInput(due_date)

  const rawSource = body?.source
  const sourceValue =
    typeof rawSource === 'string' && rawSource.trim().length > 0
      ? rawSource.trim().slice(0, 50)
      : null

  const inspectionTypeRaw =
    typeof body?.inspection_type === 'string' ? body.inspection_type.trim().toLowerCase() : ''
  const isAdHocCreate =
    body?.ad_hoc === true || inspectionTypeRaw === 'ad_hoc'

  if (isAdHocCreate) {
    if (!getPgUrl()) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const titleTrimmed =
      typeof title === 'string' && title.trim() ? title.trim() : ''
    if (!titleTrimmed) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const inspectorEmail = await getCurrentUserEmail()
    const inspectorName = await getCurrentUserName()
    const adHocSource = sourceValue ?? 'ad_hoc'

    try {
      await ensureDatabase()
      await ensureInspectionTimingFields()
      const cu = await currentUser()
      const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
      if (!roleMayCreateAdHocInspection(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
        return NextResponse.json(
          { error: 'Forbidden: your role cannot create ad-hoc inspections' },
          { status: 403 }
        )
      }
      const loc = await validateInspectionEstateAndBlock(bodyEstateId, bodyBlockId)
      if (!loc.ok) {
        return NextResponse.json({ error: loc.message }, { status: loc.status })
      }
      const estateId = loc.estateId
      const blockId = loc.blockId
      const inspectionId = crypto.randomUUID()
      const locationLabel =
        location && String(location).trim() ? String(location).trim() : null
      const desc =
        description && String(description).trim() ? String(description).trim() : null
      const adHocSnapshot = {
        id: 'ad_hoc',
        name: 'Ad Hoc Inspection',
        template_type: 'ad_hoc',
        sections: [],
      }
      const adHocVersion = await getOrCreateTemplateVersion('ad_hoc', 'Ad Hoc Inspection', adHocSnapshot)

      const workType = deriveInspectionWorkType({
        role: roleCtx.jobTitle,
        source: adHocSource,
        explicit: body?.work_type,
        isScheduled: false,
      })
      const adHocTimes = operationalInspectionTimes(adHocSnapshot, inspection_start_time, inspection_end_time)

      await sql`
        INSERT INTO inspections (
          id, legacy_inspection_id, type, title, description, location_label, due_date,
          template_id, template_name, template_version_id, template_version, status, submitted_at,
          inspection_start_time, inspection_end_time, created_at, updated_at,
          inspector_id, inspector_name, estate_id, block_id, source, work_type
        )
        VALUES (
          ${inspectionId},
          NULL,
          'ad_hoc',
          ${titleTrimmed},
          ${desc},
          ${locationLabel},
          ${dueDateParsed},
          NULL,
          NULL,
          ${adHocVersion.id},
          ${JSON.stringify(adHocVersion.snapshot)}::jsonb,
          'draft',
          NULL,
          ${adHocTimes.start},
          ${adHocTimes.end},
          ${new Date()},
          ${new Date()},
          ${inspectorEmail || null},
          ${inspectorName || null},
          ${estateId},
          ${blockId},
          ${adHocSource},
          ${workType}
        )
      `
      return NextResponse.json({ inspectionId, id: inspectionId }, { status: 201 })
    } catch (error) {
      console.error('Error creating ad hoc inspection:', error)
      return NextResponse.json(
        { error: 'Failed to create inspection', details: error.message },
        { status: 500 }
      )
    }
  }

  const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY
  if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
    return NextResponse.json(
      { error: 'Airtable not configured. Set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY).' },
      { status: 503 }
    )
  }

  if (!template_id) {
    return NextResponse.json(
      { error: 'template_id is required' },
      { status: 400 }
    )
  }

  if (!getPgUrl()) {
    return NextResponse.json(
      { error: 'Database not configured. Please set up Postgres.' },
      { status: 503 }
    )
  }

  const inspectorEmail = await getCurrentUserEmail()
  const inspectorName = await getCurrentUserName()

  try {
    const nested = await getTemplatesNested()
    let template = nested.find((t) => t.id === template_id)
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 400 }
      )
    }
    if (isEstateWalkaboutTemplate(template)) {
      template = getCanonicalEstateWalkaboutTemplateForInsert(template)
    }
    applyTemplateDisplayPatches(template)

    if (isEstateInspectionFormTemplate(template)) {
      logInspectionQuestionPipeline('inspection_create_live_template_from_getTemplatesNested', {
        template_id: template.id,
        template_name: template.name,
        ...countQuestionsInTemplate(template),
      })
    }

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(
      userId,
      cu?.publicMetadata?.isAdmin === true,
      { ...cu?.publicMetadata, ...cu?.privateMetadata, ...cu?.unsafeMetadata }
    )
    if (!roleMayCreateInspectionWithTemplate(roleCtx.normalized, roleCtx.clerkIsAdmin, template)) {
      return NextResponse.json(
        { error: 'Forbidden: your role cannot use this form template' },
        { status: 403 }
      )
    }

    if (
      (isCaretakerTemplate(template) ||
        isEsmInspectionFormTemplate(template) ||
        isGroundsMaintenanceTemplate(template)) &&
      !String(bodyBlockId || '').trim()
    ) {
      return NextResponse.json({ error: 'Location is required' }, { status: 400 })
    }

    await ensureDatabase()
    await ensureInspectionTimingFields()
    const loc = await validateInspectionEstateAndBlock(bodyEstateId, bodyBlockId)
    if (!loc.ok) {
      return NextResponse.json({ error: loc.message }, { status: loc.status })
    }
    const estateId = loc.estateId
    const blockId = loc.blockId
    const inspectionId = crypto.randomUUID()
    const snapshot = buildTemplateVersionSnapshot(template)
    if (isEstateInspectionFormTemplate(template)) {
      logInspectionQuestionPipeline('template_version_snapshot_built_for_insert', {
        template_id: template.id,
        template_name: template.name,
        ...countQuestionsInTemplate(snapshot),
      })
    }
    const templateVersion = await getOrCreateTemplateVersion(template_id, template.name || null, snapshot)
    if (isEstateInspectionFormTemplate(template)) {
      logInspectionQuestionPipeline('template_version_after_getOrCreate', {
        template_id: template.id,
        template_version_id: templateVersion.id,
        reused: templateVersion.reused,
        version_hash_prefix: templateVersion.versionHash?.slice(0, 12) ?? null,
        ...countQuestionsInTemplate(templateVersion.snapshot),
      })
    }
    const inspectionRowType = isEstateWalkaboutTemplate(template) ? 'estate_walkabout' : 'inspection'
    const workType = deriveInspectionWorkType({
      template,
      role: roleCtx.jobTitle,
      source: sourceValue,
      explicit: body?.work_type,
      isScheduled: false,
    })
    const draftTimes = operationalInspectionTimes(template, inspection_start_time, inspection_end_time)
    const submittedTimes = operationalInspectionTimes(template, inspection_start_time, inspection_end_time, { defaultEnd: true })

    // Draft-only: create inspection with status 'draft' for wizard flow (e.g. Neighbourhood Voice)
    if (createDraft === true) {
      const displayTitle = (typeof title === 'string' && title.trim())
        ? title.trim()
        : [template.name, location && String(location).trim()].filter(Boolean).join(' – ') || inspectionId.slice(0, 8)
      await sql`
        INSERT INTO inspections (
          id, legacy_inspection_id, type, title, description, location_label, due_date,
          template_id, template_name, template_version_id, template_version, status, submitted_at,
          inspection_start_time, inspection_end_time, created_at, updated_at,
          inspector_id, inspector_name, estate_id, block_id, source, work_type
        )
        VALUES (
          ${inspectionId},
          NULL,
          ${inspectionRowType},
          ${displayTitle},
          ${description && String(description).trim() ? String(description).trim() : null},
          ${location && String(location).trim() ? String(location).trim() : null},
          ${dueDateParsed},
          ${template_id},
          ${template.name || null},
          ${templateVersion.id},
          ${JSON.stringify(templateVersion.snapshot)}::jsonb,
          'draft',
          NULL,
          ${draftTimes.start},
          ${draftTimes.end},
          ${new Date()},
          ${new Date()},
          ${inspectorEmail || null},
          ${inspectorName || null},
          ${estateId},
          ${blockId},
          ${sourceValue},
          ${workType}
        )
      `
      return NextResponse.json(
        {
          inspectionId,
          templateVersionId: templateVersion.id,
          templateVersionHash: templateVersion.versionHash,
          templateVersionReused: templateVersion.reused,
          snapshotDebug: summarizeTemplateSnapshotForDebug(templateVersion.snapshot),
          ...(isEstateInspectionFormTemplate(template)
            ? {
                questionPipelineDebug: {
                  live_getTemplatesNested: countQuestionsInTemplate(template),
                  persisted_template_version: countQuestionsInTemplate(templateVersion.snapshot),
                  templateVersionReused: templateVersion.reused,
                  template_version_id: templateVersion.id,
                },
              }
            : {}),
        },
        { status: 201 }
      )
    }

    const displayTitle = (typeof title === 'string' && title.trim())
      ? title.trim()
      : [template.name, location && String(location).trim()].filter(Boolean).join(' – ') || inspectionId.slice(0, 8)

    const gradingValue = deriveInspectionGrading(template, answers)

    await sql`
      INSERT INTO inspections (
        id, legacy_inspection_id, type, title, description, location_label, due_date,
        template_id, template_name, template_version_id, template_version, status, submitted_at,
        inspection_start_time, inspection_end_time, created_at, updated_at,
        inspector_id, inspector_name, estate_id, block_id, source, work_type, grading
      )
      VALUES (
        ${inspectionId},
        NULL,
        ${inspectionRowType},
        ${displayTitle},
        ${description && String(description).trim() ? String(description).trim() : null},
        ${location && String(location).trim() ? String(location).trim() : null},
        ${dueDateParsed},
        ${template_id},
        ${template.name || null},
        ${templateVersion.id},
        ${JSON.stringify(templateVersion.snapshot)}::jsonb,
        'submitted',
        ${new Date()},
        ${submittedTimes.start},
        ${submittedTimes.end},
        ${new Date()},
        ${new Date()},
        ${inspectorEmail || null},
        ${inspectorName || null},
        ${estateId},
        ${blockId},
        ${sourceValue},
        ${workType},
        ${gradingValue}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location_label = EXCLUDED.location_label,
        due_date = EXCLUDED.due_date,
        template_id = EXCLUDED.template_id,
        template_name = EXCLUDED.template_name,
        template_version_id = EXCLUDED.template_version_id,
        template_version = EXCLUDED.template_version,
        status = EXCLUDED.status,
        submitted_at = EXCLUDED.submitted_at,
        inspection_start_time = COALESCE(EXCLUDED.inspection_start_time, inspections.inspection_start_time),
        inspection_end_time = COALESCE(EXCLUDED.inspection_end_time, inspections.inspection_end_time),
        inspector_id = COALESCE(EXCLUDED.inspector_id, inspections.inspector_id),
        inspector_name = COALESCE(EXCLUDED.inspector_name, inspections.inspector_name),
        estate_id = COALESCE(EXCLUDED.estate_id, inspections.estate_id),
        block_id = COALESCE(EXCLUDED.block_id, inspections.block_id),
        source = COALESCE(EXCLUDED.source, inspections.source),
        work_type = COALESCE(EXCLUDED.work_type, inspections.work_type),
        grading = COALESCE(EXCLUDED.grading, inspections.grading),
        updated_at = ${new Date()}
    `

    const questionsById = new Map()
    template.sections.forEach((sec) => {
      ;(sec.questions || []).forEach((q) => questionsById.set(q.id, { ...q, sectionId: sec.id }))
    })

    // Persist answers into Postgres inspection_answers (system of record)
    try {
      for (const [questionId, answer] of Object.entries(answers)) {
          if (answer === undefined || answer === null) continue
          const question = questionsById.get(questionId)
          if (!question) continue
          const extras = answer_extras[questionId] || {}
          const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
          const packedNotes = typeof extras.notes === 'string' && extras.notes.trim()
            ? extras.notes.trim()
            : packNvWizardExtras(extras)

          const questionType = question.question_type || 'text'
          const rawValue = typeof answer === 'string' ? answer : String(answer)
          const lower = String(answer).toLowerCase()
          const answerBoolean =
            questionType === 'yes_no'
              ? (lower === 'yes' ? true : lower === 'no' ? false : null)
              : null
          const asNumber = Number(answer)
          const answerNumber =
            questionType === 'number' && Number.isFinite(asNumber) ? asNumber : null

          const answerId = `answer_${inspectionId}_${questionId}`

          // Base columns only (matches POST /api/inspections/[id]/answers). Phase-2 routing columns
          // (triggers_task, etc.) require migration 20250302000000; omit so inserts work on init schema.
          await sql`
            INSERT INTO inspection_answers (
              id, inspection_id, section_id, question_id, question_type,
              answer_value, answer_text, answer_number, answer_boolean, notes
            )
            VALUES (
              ${answerId},
              ${inspectionId},
              ${question.sectionId},
              ${questionId},
              ${questionType},
              ${rawValue},
              ${rawValue},
              ${answerNumber},
              ${answerBoolean},
              ${packedNotes || comment || null}
            )
            ON CONFLICT (inspection_id, question_id) DO UPDATE SET
              answer_value = EXCLUDED.answer_value,
              answer_text = EXCLUDED.answer_text,
              answer_number = EXCLUDED.answer_number,
              answer_boolean = EXCLUDED.answer_boolean,
              notes = EXCLUDED.notes,
              updated_at = CURRENT_TIMESTAMP
          `
        }
    } catch (answersErr) {
      console.error('[Inspections] Could not persist inspection answers to Postgres:', answersErr)
    }

    // Store photos in inspection_photos for PDF/noticeboard pipeline
    try {
      for (const [questionId, answer] of Object.entries(answers)) {
          if (answer === undefined || answer === null) continue
          const extras = answer_extras[questionId] || {}
          const urls = Array.isArray(extras.photo_urls)
            ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
            : Array.isArray(extras.photoUrls)
              ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
              : []
          const singleUrl = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
          const idCardUrls = collectEsmIdCardPhotoUrls(extras)
          const allUrls = singleUrl ? [singleUrl, ...urls, ...idCardUrls] : [...urls, ...idCardUrls]
          for (let i = 0; i < allUrls.length; i++) {
            const url = allUrls[i]
            const photoId = `photo_${inspectionId}_${questionId}_${Date.now()}_${i}`
            await sql`
              INSERT INTO inspection_photos (id, inspection_id, question_id, blob_url, blob_key, filename)
              VALUES (${photoId}, ${inspectionId}, ${questionId}, ${url}, null, null)
            `
          }
      }
    } catch (photoErr) {
      console.warn('[Inspections] Could not store photos for PDF pipeline:', photoErr.message)
    }

    const actionsForPoster = []
    const walkaboutEmailResults = { sent: 0, failed: [] }
    const caretakerEmailResults = { sent: 0, failed: [] }
    const esmEmailResults = { sent: 0, failed: [] }
    const actionCreationWarnings = []
    let walkaboutEstateName = ''

    // Estate Walkabout: photos embedded in checklist JSON (per item)
    if (isEstateWalkaboutTemplate(template)) {
      try {
        const raw = answers[ESTATE_WALKABOUT_CHECKLIST_QID]
        const s = typeof raw === 'string' ? raw.trim() : ''
        if (s) {
          const parsed = JSON.parse(s)
          const items = Array.isArray(parsed) ? parsed : []
          let idx = 0
          for (const item of items) {
            const urls = Array.isArray(item?.photo_urls)
              ? item.photo_urls.filter((u) => typeof u === 'string' && u.trim())
              : []
            for (const url of urls) {
              const photoId = `photo_${inspectionId}_ewchk_${idx++}_${Date.now()}`
              await sql`
                INSERT INTO inspection_photos (id, inspection_id, question_id, blob_url, blob_key, filename)
                VALUES (${photoId}, ${inspectionId}, ${ESTATE_WALKABOUT_CHECKLIST_QID}, ${url}, null, null)
              `
            }
          }
        }
      } catch (ewPhotoErr) {
        console.warn('[Inspections] Estate walkabout checklist photos:', ewPhotoErr.message)
      }
      try {
        const estNameRes = await sql`SELECT name FROM estates WHERE id = ${estateId} LIMIT 1`
        const estateName = estNameRes.rows[0]?.name || ''
        walkaboutEstateName = estateName
        const walkaboutActionsResult = await createEstateWalkaboutActionsFromPayload(sql, {
          inspectionId,
          estateName,
          template,
          answers,
          answer_extras,
          inspectorName,
          inspectorEmail,
          locationLine: displayTitle,
          submittedAt: new Date().toISOString(),
          inspectionTypeLabel: template.name || '',
        })
        if (Array.isArray(walkaboutActionsResult?.actions)) {
          actionsForPoster.push(...walkaboutActionsResult.actions)
        }
        if (walkaboutActionsResult?.emailResults) {
          walkaboutEmailResults.sent += walkaboutActionsResult.emailResults.sent || 0
          if (Array.isArray(walkaboutActionsResult.emailResults.failed)) {
            walkaboutEmailResults.failed.push(...walkaboutActionsResult.emailResults.failed)
          }
        }
      } catch (ewActErr) {
        console.warn('[Inspections] Estate walkabout actions:', ewActErr.message)
      }
    }

    if (isEsmInspectionFormTemplate(template)) {
      try {
        const esmActionsResult = await createEsmActionsFromPayload(sql, {
          inspectionId,
          template,
          answers,
          answerExtras: answer_extras,
          inspectorName,
          locationLine: displayTitle || String(location || '').trim(),
          submittedAt: new Date().toISOString(),
          blockId: bodyBlockId || null,
        })
        if (Array.isArray(esmActionsResult?.actions)) {
          actionsForPoster.push(...esmActionsResult.actions)
        }
        for (const warning of esmActionsResult?.warnings || []) {
          console.warn('[Inspections] ESM action warning:', warning)
          actionCreationWarnings.push(warning)
        }
      } catch (esmActErr) {
        console.warn('[Inspections] ESM actions:', esmActErr?.message || esmActErr)
        actionCreationWarnings.push(`ESM actions: ${esmActErr?.message || String(esmActErr)}`)
      }
    }

    let emailGroupsByTeam = null

    for (const section of template.sections || []) {
      for (const q of section.questions || []) {
        const answer = answers[q.id]
        if (answer === undefined || answer === null) continue
        if (
          isEstateWalkaboutTemplate(template) &&
          q.question_type === 'yes_no' &&
          String(q.id || '').startsWith('ew_it_')
        ) {
          // Walkabout inspection-item actions are created by the dedicated helper above,
          // which also handles idempotency for reopened/submitted records.
          continue
        }
        const extras = answer_extras[q.id] || {}
        const answerCommentKey = `${q.id}_comment`
        const answerComment = typeof answers[answerCommentKey] === 'string' ? answers[answerCommentKey].trim() : ''
        const comment = answerComment || (typeof extras.comment === 'string' ? extras.comment.trim() : '')
        const photoUrlsArr = Array.isArray(extras.photo_urls)
          ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
          : Array.isArray(extras.photoUrls)
            ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
            : []
        const photoUrlSingle = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
        const allPhotoUrls = photoUrlSingle ? [photoUrlSingle, ...photoUrlsArr] : photoUrlsArr

        if (isEsmInspectionFormTemplate(template)) {
          // ESM action-plan rows are created by the dedicated helper above,
          // matching the Walkabout best-effort action creation pattern.
          continue
        }
        const residentMessage = comment || q.question_text || 'Issue raised from inspection'
        const category = safeActionText(q.action_category || q.category, 'Follow-up', 50)
        let isIssue = inspectionAnswerTriggersIssue(q, section, answer)
        if (
          isIssue &&
          isEstateWalkaboutTemplate(template) &&
          q.question_type === 'yes_no' &&
          String(q.id || '').startsWith('ew_it_')
        ) {
          const hasCommentOrPhoto = Boolean(comment || allPhotoUrls.length)
          if (!hasCommentOrPhoto) {
            isIssue = false
          }
        }

        if (isIssue) {
          try {
            const existingAction = await sql`
              SELECT id FROM actions
              WHERE inspection_id = ${inspectionId} AND question_id = ${q.id}
              LIMIT 1
            `
            if (existingAction.rows.length > 0) continue
            const actionId = `action_${inspectionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
            const isCaretakerAction = isCaretakerTemplate(template)
            const isGroundsAction =
              isGroundsMaintenanceTemplate(template) &&
              (q.action_category === 'grounds' || q.category === 'grounds')
            const qText = q.question_text || q.label || q.id
            const actionRecipient =
              (isCaretakerAction || q.action_recipient_required_when) &&
              extras.recipient_person_id &&
              String(extras.recipient_person_id).trim()
                ? String(extras.recipient_person_id).trim()
                : null
            const actionTitleRaw = isCaretakerAction
              ? `${section.title || section.name || 'Section'} - ${qText}`
              : isGroundsAction
                  ? `${section.title || section.name || 'Section'} - ${qText}`
                  : residentMessage
            const actionTitle = safeActionText(actionTitleRaw, residentMessage, 500)
            const actionDescription = isCaretakerAction
              ? [qText, comment].filter(Boolean).join('\n\n')
              : isGroundsAction
                  ? [qText, `Answer: ${String(answer ?? '')}`, comment].filter(Boolean).join('\n\n')
                  : residentMessage
            const actionLocation = isGroundsAction
              ? (String(location || '').trim() || displayTitle || null)
              : null
            await sql`
              INSERT INTO actions (
                id, inspection_id, section_id, section_name, question_id,
                category, priority, title, description, location, status,
                comment, recipient_person_id, auto_created, photo_urls, cost_code
              )
              VALUES (
                ${actionId}, ${inspectionId}, ${section.id}, ${section.title}, ${q.id},
                ${category}, null, ${actionTitle}, ${actionDescription}, ${actionLocation}, 'open',
              ${comment || null}, ${actionRecipient}, true, ${JSON.stringify([...allPhotoUrls, ...collectEsmIdCardPhotoUrls(extras)])}, null
              )
            `
            const actionForPoster = {
              id: actionId,
              category,
              title: actionTitle,
              description: actionDescription,
              comment: comment || null,
              photo_urls: allPhotoUrls,
              created_at: new Date(),
            }
            actionsForPoster.push(actionForPoster)
            try {
              const locLine = displayTitle || String(location || '').trim() || '—'
              const pdfR = await tryGenerateAndStoreIssueJobCardPdf(sql, {
                actionId,
                inspectionId,
                inspectionType: template.name || 'Inspection',
                blockEstate: locLine,
                location: locLine,
                exactLocation: locLine,
                dateRaised: formatDateGb(new Date()),
                dateSent: formatDateGb(new Date()),
                issueTitle: residentMessage,
                issueType: String(category || 'Issue').replace(/_/g, ' '),
                issueDetail: [q.question_text || q.label, comment].filter(Boolean).join('\n\n').slice(0, 2500),
                priority: 'As reported',
                assignedTeam: '—',
                targetCompletionDate: 'TBC',
                jobNumber: 'Pending assignment',
                status: 'Open',
                photoUrls: allPhotoUrls,
              })
              if (pdfR?.url) {
                actionForPoster.issue_pdf_url = pdfR.url
              }
              if (!pdfR?.ok) {
                console.warn('[Inspections] Issue job card PDF:', actionId, pdfR?.error)
              }
              if (isEstateWalkaboutTemplate(template)) {
                try {
                  const notify = await sendEstateWalkaboutRepairActionNotification(sql, {
                    inspectionId,
                    questionId: q.id,
                    actionTitle: residentMessage,
                    actionPlanPdfUrl: pdfR?.url || null,
                    estateName: walkaboutEstateName || displayTitle || '',
                    locationLine: locLine,
                    submittedAt: new Date().toISOString(),
                    inspectorName,
                    description: [q.question_text || q.label, comment].filter(Boolean).join('\n\n'),
                    actionSummary: residentMessage,
                    photoUrls: allPhotoUrls,
                  })
                  walkaboutEmailResults.sent += notify.sent || 0
                  if (Array.isArray(notify.failed)) {
                    walkaboutEmailResults.failed.push(...notify.failed)
                  }
                } catch (notifyErr) {
                  console.warn('[Inspections] Estate walkabout repair email failed:', notifyErr?.message || notifyErr)
                  walkaboutEmailResults.failed.push({
                    actionId,
                    error: notifyErr?.message || String(notifyErr),
                  })
                }
              }
            } catch (issuePdfErr) {
              console.warn('[Inspections] Issue job card PDF failed:', issuePdfErr?.message || issuePdfErr)
            }
          } catch (pgErr) {
            console.warn('[Inspections] Could not create Postgres action for poster:', pgErr.message)
          }
        }

        if (isIssue && q.triggers_task) {
          try {
            const taskId = `task_${inspectionId}_${q.id}_${Date.now()}`
            await sql`
              INSERT INTO tasks (id, inspection_id, question_id, category, issue_type, programme_tag, description, status)
              VALUES (${taskId}, ${inspectionId}, ${q.id}, ${q.category || category}, ${q.issue_type || null}, ${q.programme_tag || null}, ${residentMessage}, 'open')
            `
          } catch (taskErr) {
            console.warn('[Inspections] Could not create task:', taskErr.message)
          }
        }

        if (isIssue && q.triggers_email) {
          // Collect for grouping by team (done below)
          if (!emailGroupsByTeam) emailGroupsByTeam = new Map()
          const teamKey = (q.email_route_team_id && String(q.email_route_team_id).trim()) || `_q_${q.id}`
          const emailTo = (q.email_routing && String(q.email_routing).trim()) || inspectorEmail || ''
          if (!emailGroupsByTeam.has(teamKey)) {
            emailGroupsByTeam.set(teamKey, { emailTo, questionIds: [] })
          }
          const entry = emailGroupsByTeam.get(teamKey)
          entry.questionIds.push(q.id)
          if (emailTo) entry.emailTo = emailTo
        }
      }
    }

    // Create one outbound_email row per team (grouped by email_route_team_id)
    if (emailGroupsByTeam) {
      for (const [teamKey, { emailTo, questionIds }] of emailGroupsByTeam) {
        try {
          const isTeam = !teamKey.startsWith('_q_')
          const emailId = `email_${inspectionId}_${teamKey.replace(/\W/g, '_')}_${Date.now()}`
          const toAddress = emailTo || (isTeam ? teamKey : '')
          await sql`
            INSERT INTO outbound_emails (id, inspection_id, question_id, email_to, email_routing, status)
            VALUES (${emailId}, ${inspectionId}, ${questionIds[0] || null}, ${toAddress || 'pending'}, ${isTeam ? teamKey : null}, 'pending')
          `
          if (toAddress) {
            await sql`UPDATE outbound_emails SET sent_at = CURRENT_TIMESTAMP, status = 'sent' WHERE id = ${emailId}`
          }
        } catch (emailErr) {
          console.warn('[Inspections] Could not log outbound email:', emailErr.message)
        }
      }
    }

    const fullPdfUrl = null
    let posterPdfUrl = null
    let pdfErrorMessage = null
    try {
      const inspectionForPoster = {
        id: inspectionId,
        title: displayTitle,
        location_label: location || null,
        submitted_at: new Date(),
        inspector_name: inspectorName || '',
      }
      if (actionsForPoster.length > 0) {
        const posterPdfBytes = await generatePosterPdfBuffer(inspectionForPoster, actionsForPoster)
        posterPdfUrl = await uploadInspectionPdfToBlob({
          inspectionId,
          pdfBytes: posterPdfBytes,
          kind: 'poster',
        })
      }

      await sql`
        UPDATE inspections 
        SET poster_pdf_url = COALESCE(${posterPdfUrl}, poster_pdf_url),
            pdf_generation_error = ${pdfErrorMessage}
        WHERE id = ${inspectionId}
      `
    } catch (pdfErr) {
      pdfErrorMessage = pdfErr?.message || String(pdfErr)
      console.error('[Inspections] Error generating poster PDF:', pdfErr)
      try {
        const truncated =
          pdfErrorMessage.length > 2000 ? pdfErrorMessage.slice(0, 2000) : pdfErrorMessage
        await sql`
          UPDATE inspections
          SET pdf_generation_error = ${truncated}
          WHERE id = ${inspectionId}
        `
      } catch (updErr) {
        console.error('[Inspections] Could not persist pdf_generation_error:', updErr)
      }
    }

    if (isEstateWalkaboutTemplate(template)) {
      try {
        const bulkEmailResult = await sendBulkRefuseWalkaboutEmail(sql, {
          request,
          inspectionId,
          estateName: walkaboutEstateName,
          locationLine: displayTitle || String(location || '').trim(),
          answers,
          answerExtras: answer_extras,
          posterPdfUrl,
          submittedAt: new Date().toISOString(),
        })
        walkaboutEmailResults.sent += bulkEmailResult.sent || 0
        if (Array.isArray(bulkEmailResult.failed)) {
          walkaboutEmailResults.failed.push(...bulkEmailResult.failed)
        }
      } catch (bulkEmailErr) {
        console.warn('[Inspections] Bulk refuse email failed:', bulkEmailErr?.message || bulkEmailErr)
        walkaboutEmailResults.failed.push({
          email: WALKABOUT_BULK_REFUSE_EMAIL,
          error: bulkEmailErr?.message || String(bulkEmailErr),
        })
        if (normalizeYesNoAnswer(answers?.[WALKABOUT_BULK_REFUSE_QID]) === 'yes') {
          await logBulkRefuseEmail(sql, {
            inspectionId,
            status: 'failed',
            routing: `estate_walkabout_bulk_refuse:${bulkEmailErr?.message || 'error'}`,
          })
        }
      }
    }

    if (isCaretakerTemplate(template)) {
      try {
        const notifications = collectCaretakerEmailNotifications({
          template,
          answers,
          answerExtras: answer_extras,
          inspectorEmail,
        })
        const sent = await sendCaretakerEmailNotifications(sql, {
          inspectionId,
          inspectionTitle: template.name || 'Caretaker inspection',
          locationLine: displayTitle || String(location || '').trim(),
          notifications,
        })
        caretakerEmailResults.sent += sent.sent || 0
        if (Array.isArray(sent.failed)) caretakerEmailResults.failed.push(...sent.failed)
      } catch (caretakerEmailErr) {
        console.warn('[Inspections] Caretaker notification email failed:', caretakerEmailErr?.message || caretakerEmailErr)
        caretakerEmailResults.failed.push({ error: caretakerEmailErr?.message || String(caretakerEmailErr) })
      }
    }

    if (isEsmInspectionFormTemplate(template)) {
      try {
        const notifications = collectEsmEmailNotifications({
          template,
          answers,
          answerExtras: answer_extras,
        })
        const sent = await sendEsmEmailNotifications(sql, {
          inspectionId,
          inspectionTitle: template.name || 'ESM inspection',
          locationLine: displayTitle || String(location || '').trim(),
          notifications,
        })
        esmEmailResults.sent += sent.sent || 0
        if (Array.isArray(sent.failed)) esmEmailResults.failed.push(...sent.failed)
      } catch (esmEmailErr) {
        console.warn('[Inspections] ESM notification email failed:', esmEmailErr?.message || esmEmailErr)
        esmEmailResults.failed.push({ error: esmEmailErr?.message || String(esmEmailErr) })
      }
    }

    return NextResponse.json({
      inspectionId,
      id: inspectionId,
      templateVersionId: templateVersion.id,
      templateVersionHash: templateVersion.versionHash,
      templateVersionReused: templateVersion.reused,
      snapshotDebug: summarizeTemplateSnapshotForDebug(templateVersion.snapshot),
      ...(isEstateInspectionFormTemplate(template)
        ? {
            questionPipelineDebug: {
              live_getTemplatesNested: countQuestionsInTemplate(template),
              persisted_template_version: countQuestionsInTemplate(templateVersion.snapshot),
              templateVersionReused: templateVersion.reused,
              template_version_id: templateVersion.id,
            },
          }
        : {}),
      pdfUrl: fullPdfUrl || undefined,
      fullPdfUrl: fullPdfUrl || undefined,
      posterPdfUrl: posterPdfUrl || undefined,
      emails_sent: (walkaboutEmailResults.sent || 0) + (caretakerEmailResults.sent || 0) + (esmEmailResults.sent || 0) || undefined,
      email_failures:
        walkaboutEmailResults.failed.length || caretakerEmailResults.failed.length || esmEmailResults.failed.length
          ? [...walkaboutEmailResults.failed, ...caretakerEmailResults.failed, ...esmEmailResults.failed]
          : undefined,
      ...(actionCreationWarnings.length > 0 ? { action_creation_warnings: actionCreationWarnings } : {}),
      ...(pdfErrorMessage ? { pdfError: pdfErrorMessage } : {}),
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating inspection:', error)
    return NextResponse.json(
      { error: 'Failed to create inspection', details: error.message },
      { status: 500 }
    )
  }
}
