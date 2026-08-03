import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, ensureInspectionTimingFields, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail, getCurrentUserName } from '@/lib/auth'
import {
  extractCaretakerRecipients,
  findRecipientQuestion,
  isCaretakerTemplate,
} from '@/lib/caretaker-template'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import {
  buildCaretakerActionDescription,
  shouldAutocreateCaretakerAction,
  shouldAutocreateCaretakerGradedAction,
  normalizeYesNoAnswer,
} from '@/lib/caretaker-action-details'
import { parseCaretakerAnswerNotes } from '@/lib/caretaker-answer-extras'
import { findSectionCostCodeAnswer } from '@/lib/caretaker-section-cost-code'
import {
  caretakerSectionInScope,
  resolveCaretakerInspectionScope,
} from '@/lib/caretaker-specific-task-inspection'
import { resolveStoredQuestionType } from '@/lib/resolveStoredQuestionType'
import { deriveInspectionGrading } from '@/lib/deriveInspectionGrading'
import { generatePosterPdfBuffer } from '../../../../../lib/poster-pdf'
import { uploadInspectionPdfToBlob } from '../../../../../lib/blob/uploadPdf'
import { sendEmails } from '@/lib/email-sender'
import { applyNeighbourhoodVoiceTemplatePatch } from '@/lib/neighbourhood-voice-template-patch'
import { isNeighbourhoodVoiceTemplateVersion } from '@/lib/neighbourhood-voice-question-schema'
import { createNeighbourhoodVoiceAutoActions } from '@/lib/neighbourhood-voice-submit-actions'
import { isEstateWalkaboutTemplateVersion } from '@/lib/estate-walkabout-template'
import {
  applyGroundsMaintenanceTemplateToSnapshot,
  isGroundsMaintenanceTemplate,
} from '@/lib/grounds-maintenance-template'
import { createEstateWalkaboutActionsFromInspection } from '@/lib/estate-walkabout-actions'
import { createEsmActionsFromInspection } from '@/lib/esm-action-plan-actions'
import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'
import {
  tryGenerateAndStoreIssueJobCardPdf,
  formatAssignedTeamLabel,
  formatDateGb,
} from '@/lib/issue-job-card-upload'
import { getAppRoleContextForClerkUser, roleMayCreateInspectionWithTemplate } from '@/lib/app-role-access'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'
import { ensureFullInspectionPdf } from '@/lib/full-inspection-report-pdf'
import { sendInspectionSubmissionConfirmationEmail } from '@/lib/inspection-submission-confirmation-email'
import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'
import { croydonLogoEmailHeaderHtml } from '@/lib/logo-branding'
import { insertActionWithOptionalColumns } from '@/lib/action-insert-columns'
import {
  ISSUE_RECIPIENT_UNAVAILABLE_MESSAGE,
  isRecipientPersonFkError,
  resolveIssueRecipientForAction,
} from '@/lib/validate-issue-recipient'
import { getRequestTrace, logAccessTrace, roleTrace, templateTrace } from '@/lib/access-trace'
import { ROLE_CANNOT_SUBMIT_API_MESSAGE } from '@/lib/inspection-permission-messages'
import { sendBulkRefuseWalkaboutEmail } from '@/lib/walkabout-email-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CARETAKER_SECTION_2_EMAIL = 'housingestateservices@croydon.gov.uk'
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

function collectEsmIdCardPhotoUrlsFromExtras(extras) {
  const structured = extras?.structured && typeof extras.structured === 'object' ? extras.structured : {}
  return Array.isArray(structured.id_card_photo_urls)
    ? structured.id_card_photo_urls.filter((url) => typeof url === 'string' && url.trim())
    : []
}

function buildAnswerExtrasMapFromRows(answerRows) {
  const map = {}
  for (const row of answerRows || []) {
    const qid = row?.question_id
    if (!qid) continue
    const parsed = parseCaretakerAnswerNotes(row.notes)
    map[qid] = {
      comment: parsed.comment,
      recipient_person_id: parsed.recipient_person_id,
      photo_urls: parsed.extraPhotoUrls,
    }
  }
  return map
}

async function enrichAnswerExtrasWithDbPhotos(sqlFn, inspectionId, answerExtras, questionIds = []) {
  for (const questionId of questionIds) {
    if (!questionId) continue
    const photosResult = await sqlFn`
      SELECT blob_url FROM inspection_photos
      WHERE inspection_id = ${inspectionId} AND question_id = ${questionId}
    `
    const dbPhotos = (photosResult.rows || []).map((row) => row.blob_url).filter(Boolean)
    if (dbPhotos.length === 0) continue
    const existing = answerExtras[questionId] || {}
    answerExtras[questionId] = {
      ...existing,
      photo_urls: [...new Set([...(existing.photo_urls || []), ...dbPhotos])],
    }
  }
  return answerExtras
}

function parseInspectionTimeInput(value) {
  if (value == null || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function safeActionText(value, fallback, maxLength) {
  const text = String(value || fallback || '').trim()
  const safe = text || String(fallback || 'Inspection action')
  return maxLength && safe.length > maxLength ? safe.slice(0, maxLength) : safe
}

const EMAIL_RE = /^[^\s@()<>]+@[^\s@()<>]+\.[^\s@()<>]+$/

function normalizeEmail(value) {
  const email = String(value || '').trim()
  return EMAIL_RE.test(email) ? email : ''
}

function extractEmailFromLegacyLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const parenMatch = text.match(/\(([^()\s]+@[^()\s]+)\)\s*$/)
  if (parenMatch) return normalizeEmail(parenMatch[1])
  const emailMatch = text.match(/[^\s()<>]+@[^\s()<>]+\.[^\s()<>]+/)
  return emailMatch ? normalizeEmail(emailMatch[0]) : ''
}

async function resolveRecipientEmail(value) {
  const raw = String(value || '').trim()
  if (!raw) return { email: '', source: 'empty', personId: '' }

  const directEmail = normalizeEmail(raw)
  if (directEmail) return { email: directEmail, source: 'raw_email', personId: '' }

  try {
    const personRes = await sql`
      SELECT id, email FROM people
      WHERE id = ${raw} AND COALESCE(active, true) = true
      LIMIT 1
    `
    const person = personRes.rows[0]
    const personEmail = normalizeEmail(person?.email)
    if (personEmail) return { email: personEmail, source: 'person_id', personId: String(person.id || raw) }
  } catch (error) {
    console.warn('[inspections/submit] recipient person lookup failed:', { error: error?.message || String(error) })
  }

  const legacyEmail = extractEmailFromLegacyLabel(raw)
  if (legacyEmail) return { email: legacyEmail, source: 'legacy_label', personId: '' }

  return { email: '', source: 'unresolved', personId: '' }
}

async function sendEsmPhotoAndYesNotifications({ inspectionId, templateVersion, answers, answerRows, inspectionTitle, locationLine }) {
  if (!isEsmInspectionFormTemplate(templateVersion)) return { sent: [], failed: [] }
  const sent = []
  const failed = []
  const rowsByQuestionId = new Map((answerRows || []).map((row) => [String(row.question_id || ''), row]))
  const dedupe = new Set()

  for (const section of templateVersion.sections || []) {
    for (const q of section.questions || []) {
      if (!q?.id) continue
      const row = rowsByQuestionId.get(String(q.id))
      const extras = parseCaretakerAnswerNotes(row?.notes)
      const photosResult = await sql`
        SELECT blob_url FROM inspection_photos
        WHERE inspection_id = ${inspectionId} AND question_id = ${q.id}
      `
      const dbPhotos = (photosResult.rows || []).map((p) => p.blob_url).filter(Boolean)
      const photoUrls = [...new Set([...dbPhotos, ...extras.extraPhotoUrls])]
      const idCardPhotoUrls = collectEsmIdCardPhotoUrlsFromExtras(extras)
      const answer = answers[q.id]
      const isYes = normalizeYesNoAnswer(answer) === 'yes'
      const selectedRecipient = extras.recipient_person_id ? String(extras.recipient_person_id).trim() : ''
      const targets = []

      if (q.esm_recipient_on_yes === true && isYes && selectedRecipient) {
        targets.push({ to: selectedRecipient, routing: 'esm_graffiti_selected_recipient' })
      }
      if (q.esm_email_on_photo_to_selected_recipient === true && photoUrls.length > 0 && selectedRecipient) {
        targets.push({ to: selectedRecipient, routing: `esm_${q.esm_behavior || 'photo'}_selected_recipient_photo` })
      }
      if (q.esm_email_on_yes && isYes) {
        targets.push({ to: String(q.esm_email_on_yes), routing: `esm_${q.esm_behavior || 'yes'}_yes` })
      }
      if (q.esm_email_on_comment_or_issue && (extras.comment || isYes)) {
        targets.push({ to: String(q.esm_email_on_comment_or_issue), routing: `esm_${q.esm_behavior || 'comment'}_comment` })
      }
      if (q.esm_email_on_photo_and_comment && photoUrls.length > 0 && extras.comment) {
        targets.push({ to: String(q.esm_email_on_photo_and_comment), routing: `esm_${q.esm_behavior || 'photo_comment'}_photo_comment` })
      }
      if (q.esm_email_on_photo && photoUrls.length > 0) {
        targets.push({ to: String(q.esm_email_on_photo), routing: `esm_${q.esm_behavior || 'photo'}_photo` })
      }

      for (const target of targets) {
        const resolved = await resolveRecipientEmail(target.to)
        const to = resolved.email
        if (!to) {
          failed.push({ questionId: q.id, routing: target.routing, error: 'recipient_email_unresolved' })
          console.warn('[sendEsmPhotoAndYesNotifications] recipient unresolved', {
            inspectionId,
            questionId: q.id,
            routing: target.routing,
            resolution: resolved.source,
            personId: resolved.personId || undefined,
          })
          continue
        }
        const key = `${to}|${target.routing}|${q.id}`
        if (dedupe.has(key)) continue
        dedupe.add(key)
        const allPhotoUrls = [...photoUrls, ...idCardPhotoUrls]
        const questionText = q.question_text || q.label || 'Inspection item'
        const sectionTitle = section.title || section.name || ''
        const answerText = answer == null ? '—' : String(answer)
        const priorityText = extras.priority || q.action_priority || ''
        const statusText = isYes || photoUrls.length > 0 || extras.comment ? 'Action required' : ''
        const photoList = allPhotoUrls.length
          ? `<ul>${allPhotoUrls.map((url) => `<li><a href="${escapeHtml(url)}">Photo attached</a></li>`).join('')}</ul>`
          : '<p>No photo link recorded.</p>'
        const photoText = allPhotoUrls.length
          ? allPhotoUrls.map((url) => `Photo attached: ${url}`).join('\n')
          : 'No photo link recorded.'
        const html = `
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:680px;">
            ${croydonLogoEmailHeaderHtml()}
            <h1 style="font-size:20px;line-height:1.25;margin:0 0 16px 0;">ESM inspection notification</h1>

            <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">Inspection context</h2>
            <p style="margin:0 0 6px 0;"><strong>Inspection:</strong> ${escapeHtml(inspectionTitle || 'ESM inspection')}</p>
            ${locationLine ? `<p style="margin:0 0 6px 0;"><strong>Location:</strong> ${escapeHtml(locationLine)}</p>` : ''}

            <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">Action required</h2>
            <p style="margin:0 0 6px 0;">Please review this ESM inspection item and arrange any required follow-up.</p>
            ${statusText ? `<p style="margin:0 0 6px 0;"><strong>Status:</strong> ${escapeHtml(statusText)}</p>` : ''}
            ${priorityText ? `<p style="margin:0 0 6px 0;"><strong>Priority:</strong> ${escapeHtml(String(priorityText).replace(/_/g, ' '))}</p>` : ''}

            <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">Actions/issues</h2>
            <p style="margin:0 0 6px 0;"><strong>Section:</strong> ${escapeHtml(sectionTitle)}</p>
            <p style="margin:0 0 6px 0;"><strong>Question:</strong> ${escapeHtml(questionText)}</p>
            <p style="margin:0 0 6px 0;"><strong>Answer:</strong> ${escapeHtml(answerText)}</p>

            <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">Comments</h2>
            <p style="margin:0 0 6px 0;">${escapeHtml(extras.comment || 'No comment recorded.')}</p>

            <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">Photos</h2>
            ${photoList}

            <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">PDFs/links</h2>
            <p style="margin:0 0 6px 0;">No PDF link is available in this notification.</p>
          </div>
        `
        const text = [
          'ESM inspection notification',
          '',
          'Inspection context',
          `Inspection: ${inspectionTitle || 'ESM inspection'}`,
          locationLine ? `Location: ${locationLine}` : '',
          '',
          'Action required',
          'Please review this ESM inspection item and arrange any required follow-up.',
          statusText ? `Status: ${statusText}` : '',
          priorityText ? `Priority: ${String(priorityText).replace(/_/g, ' ')}` : '',
          '',
          'Actions/issues',
          sectionTitle ? `Section: ${sectionTitle}` : '',
          `Question: ${questionText}`,
          `Answer: ${answerText}`,
          '',
          'Comments',
          extras.comment || 'No comment recorded.',
          '',
          'Photos',
          photoText,
          '',
          'PDFs/links',
          'No PDF link is available in this notification.',
        ].filter(Boolean).join('\n')
        try {
          console.log('[sendEsmPhotoAndYesNotifications] final recipient email', {
            inspectionId,
            questionId: q.id,
            to,
            routing: target.routing,
            resolution: resolved.source,
            personId: resolved.personId || undefined,
          })
          const sendResult = await sendAppEmail({
            to,
            subject: `ESM inspection: ${section.title || locationLine || inspectionTitle || 'notification'}`,
            html,
            text,
          })
          if (sendResult.ok) {
            sent.push({ email: to, type: target.routing })
            await insertOutboundEmailLog(sql, {
              inspectionId,
              questionId: q.id,
              emailTo: to,
              emailRouting: target.routing,
              status: 'sent',
              sentAt: new Date(),
            })
          } else {
            failed.push({ email: to, error: sendResult.error || 'send_failed' })
          }
        } catch (error) {
          failed.push({ email: to, error: error?.message || String(error) })
        }
      }
    }
  }

  return { sent, failed }
}

async function sendCaretakerPhotoAndYesNotifications({
  inspectionId,
  templateVersion,
  answers,
  answerRows,
  inspectorEmail,
  inspectionTitle,
  locationLine,
  scope,
}) {
  if (!isCaretakerTemplate(templateVersion)) return { sent: 0, failed: [] }
  const sent = []
  const failed = []
  const rowsByQuestionId = new Map((answerRows || []).map((row) => [String(row.question_id || ''), row]))
  const dedupe = new Set()

  for (const section of templateVersion.sections || []) {
    if (!caretakerSectionInScope(section, scope)) continue
    const sectionNo = getCaretakerSectionNumber(section)
    const questions = section.questions || []
    for (let index = 0; index < questions.length; index += 1) {
      const q = questions[index]
      if (!q?.id) continue
      const row = rowsByQuestionId.get(String(q.id))
      const extras = parseCaretakerAnswerNotes(row?.notes)
      const photosResult = await sql`
        SELECT blob_url FROM inspection_photos
        WHERE inspection_id = ${inspectionId} AND question_id = ${q.id}
      `
      const photoUrls = [...new Set([
        ...(photosResult.rows || []).map((p) => p.blob_url).filter(Boolean),
        ...extras.extraPhotoUrls,
      ])]
      const answer = answers[q.id]
      const isYes = normalizeYesNoAnswer(answer) === 'yes'
      const partNo = getCaretakerQuestionPart(q, index)
      const targets = []

      if (sectionNo === 2 && partNo >= 1 && partNo <= 5 && photoUrls.length > 0) {
        targets.push({ to: CARETAKER_SECTION_2_EMAIL, routing: 'caretaker_section_2_photo' })
      }
      if (sectionNo === 2 && partNo === 6 && photoUrls.length > 0 && inspectorEmail) {
        targets.push({
          to: inspectorEmail,
          routing: 'caretaker_section_2_love_clean_streets',
          reminder: 'Please report this issue via the Love Clean Streets app.',
        })
      }
      if (sectionNo === 4 && isYes) targets.push({ to: CARETAKER_SECTION_3_EMAIL, routing: 'caretaker_section_3_yes' })
      if (sectionNo === 6 && isYes) targets.push({ to: CARETAKER_SECTION_5_EMAIL, routing: 'caretaker_section_5_yes' })
      if (sectionNo === 7 && isYes) targets.push({ to: CARETAKER_SECTION_6_EMAIL, routing: 'caretaker_section_6_yes' })

      for (const target of targets) {
        const to = String(target.to || '').trim()
        if (!to) continue
        const key = `${to}|${target.routing}|${q.id}`
        if (dedupe.has(key)) continue
        dedupe.add(key)
        const questionText = q.question_text || q.label || q.id
        const photoList = photoUrls.length
          ? `<ul>${photoUrls.map((url) => `<li><a href="${escapeHtml(url)}">Photo</a></li>`).join('')}</ul>`
          : '<p>No photo link recorded.</p>'
        const html = `
          <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
            ${croydonLogoEmailHeaderHtml()}
            <h1 style="font-size:18px;">Caretaker inspection notification</h1>
            <p><strong>Inspection:</strong> ${escapeHtml(inspectionTitle || 'Caretaker inspection')}</p>
            ${locationLine ? `<p><strong>Location:</strong> ${escapeHtml(locationLine)}</p>` : ''}
            <p><strong>Section:</strong> ${escapeHtml(section.title || section.name || '')}</p>
            <p><strong>Question:</strong> ${escapeHtml(questionText)}</p>
            <p><strong>Answer:</strong> ${escapeHtml(answer == null ? '—' : String(answer))}</p>
            ${extras.comment ? `<p><strong>Comment:</strong> ${escapeHtml(extras.comment)}</p>` : ''}
            ${target.reminder ? `<p>${escapeHtml(target.reminder)}</p>` : ''}
            <p><strong>Photos:</strong></p>
            ${photoList}
          </div>
        `
        const text = [
          'Caretaker inspection notification',
          locationLine ? `Location: ${locationLine}` : '',
          section.title || section.name ? `Section: ${section.title || section.name}` : '',
          `Question: ${questionText}`,
          answer == null ? '' : `Answer: ${String(answer)}`,
          extras.comment ? `Comment: ${extras.comment}` : '',
          target.reminder || '',
          ...photoUrls,
        ].filter(Boolean).join('\n')
        try {
          const sendResult = await sendAppEmail({
            to,
            subject: `Caretaker inspection: ${section.title || locationLine || inspectionTitle || 'notification'}`,
            html,
            text,
          })
          if (sendResult.ok) {
            sent.push({ email: to, type: target.routing })
            await insertOutboundEmailLog(sql, {
              inspectionId,
              questionId: q.id,
              emailTo: to,
              emailRouting: target.routing,
              status: 'sent',
              sentAt: new Date(),
            })
          } else {
            failed.push({ email: to, error: sendResult.error || 'send_failed' })
            await insertOutboundEmailLog(sql, {
              inspectionId,
              questionId: q.id,
              emailTo: to,
              emailRouting: `${target.routing}:${sendResult.error || 'failed'}`,
              status: 'failed',
              sentAt: null,
            })
          }
        } catch (error) {
          failed.push({ email: to, error: error?.message || String(error) })
          try {
            await insertOutboundEmailLog(sql, {
              inspectionId,
              questionId: q.id,
              emailTo: to,
              emailRouting: `${target.routing}:${error?.message || 'error'}`,
              status: 'failed',
              sentAt: null,
            })
          } catch {
            // best-effort audit only
          }
        }
      }
    }
  }

  return { sent, failed }
}

// POST - Submit inspection (generate PDF and send emails)
export async function POST(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureDatabase()
    await ensureInspectionTimingFields()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { id } = await params
    console.log('[inspections/submit] submit route entered', { inspectionId: id })
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    const inspectorEmail = await getCurrentUserEmail()
    const inspectorName = await getCurrentUserName()

    // Get inspection
    const inspectionResult = await sql`
      SELECT * FROM inspections WHERE id = ${id}
    `
    
    if (inspectionResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Inspection not found' },
        { status: 404 }
      )
    }
    
    const inspection = inspectionResult.rows[0]

    // Get all answers
    const answersResult = await sql`
      SELECT * FROM inspection_answers WHERE inspection_id = ${id}
      ORDER BY section_id, question_id
    `
    
    const answers = {}
    answersResult.rows.forEach(row => {
      answers[row.question_id] = row.answer_value || row.answer_text || (row.answer_boolean != null ? (row.answer_boolean ? 'Yes' : 'No') : row.answer_number)
    })

    let templateVersion = inspection.template_version
    if (typeof templateVersion === 'string') {
      try {
        templateVersion = JSON.parse(templateVersion)
      } catch {
        templateVersion = null
      }
    }
    if (templateVersion && typeof templateVersion === 'object') {
      templateVersion = applyGroundsMaintenanceTemplateToSnapshot(templateVersion)
      applyNeighbourhoodVoiceTemplatePatch(templateVersion)
      applyTemplateDisplayPatches(templateVersion)
    }

    const cuSubmit = await currentUser()
    const roleCtxSubmit = await getAppRoleContextForClerkUser(
      userId,
      cuSubmit?.publicMetadata?.isAdmin === true,
      { ...cuSubmit?.publicMetadata, ...cuSubmit?.privateMetadata, ...cuSubmit?.unsafeMetadata }
    )
    const templateForRoleCheck = templateVersion && typeof templateVersion === 'object'
      ? {
          id: templateVersion.id ?? inspection.template_id,
          name: templateVersion.name ?? inspection.template_name,
          template_key: templateVersion.template_key,
          template_type: templateVersion.template_type ?? templateVersion.type,
          type: templateVersion.type ?? templateVersion.template_type,
          sections: templateVersion.sections,
        }
      : null
    if (
      templateForRoleCheck &&
      !roleMayCreateInspectionWithTemplate(roleCtxSubmit.normalized, roleCtxSubmit.clerkIsAdmin, templateForRoleCheck)
    ) {
      logAccessTrace('api.inspections.submit.forbidden', {
        ...getRequestTrace(request),
        user_id: userId,
        inspection_id: id,
        ...roleTrace(roleCtxSubmit),
        ...templateTrace(templateForRoleCheck),
        permission: 'roleMayCreateInspectionWithTemplate',
        failure_source: 'roleMayCreateInspectionWithTemplate',
        allowed: false,
      })
      return NextResponse.json(
        { error: ROLE_CANNOT_SUBMIT_API_MESSAGE },
        { status: 403 }
      )
    }
    if (templateForRoleCheck) {
      logAccessTrace('api.inspections.submit.permission', {
        ...getRequestTrace(request),
        user_id: userId,
        inspection_id: id,
        ...roleTrace(roleCtxSubmit),
        ...templateTrace(templateForRoleCheck),
        permission: 'roleMayCreateInspectionWithTemplate',
        allowed: true,
      })
    }
    const isGroundsMaintenanceSubmission = Boolean(
      templateForRoleCheck && isGroundsMaintenanceTemplate(templateForRoleCheck)
    )
    if (
      templateForRoleCheck &&
      (isCaretakerTemplate(templateForRoleCheck) ||
        isEsmInspectionFormTemplate(templateForRoleCheck) ||
        isGroundsMaintenanceSubmission) &&
      !String(inspection.block_id || '').trim()
    ) {
      return NextResponse.json({ error: 'Location is required' }, { status: 400 })
    }

    const gradingValue = deriveInspectionGrading(templateVersion ?? inspection.template_version, answers)
    const isNv = isNeighbourhoodVoiceTemplateVersion(templateVersion)
    const wasDraft = inspection.status === 'draft'
    const submittedAtForTiming = new Date()
    const requestStartTime = parseInspectionTimeInput(body?.inspection_start_time)
    const requestEndTime = parseInspectionTimeInput(body?.inspection_end_time)
    const inspectionStartTime = isNv ? null : requestStartTime || inspection.inspection_start_time || null
    const inspectionEndTime = isNv ? null : requestEndTime || submittedAtForTiming

    const locRow = await sql`
      SELECT COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS location_line
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE i.id = ${id}
      LIMIT 1
    `
    const estateBlockLine = String(locRow.rows[0]?.location_line || inspection.location_label || inspection.title || '').trim()

    // Mark submitted first so inspection completion never depends on action rows or email.
    await sql`
      UPDATE inspections
      SET status = 'submitted',
          submitted_at = ${submittedAtForTiming},
          inspection_start_time = ${inspectionStartTime},
          inspection_end_time = ${inspectionEndTime},
          pdf_generation_error = NULL,
          work_type = COALESCE(work_type, CASE
            WHEN COALESCE(is_scheduled, false) = true THEN 'caretaker_scheduled'
            WHEN lower(COALESCE(type, '')) = 'estate_walkabout' OR lower(COALESCE(template_name, '')) LIKE '%walkabout%' THEN 'housing_walkabout'
            WHEN lower(COALESCE(template_name, '')) LIKE '%caretaker%' THEN 'caretaker_scheduled'
            WHEN lower(COALESCE(template_name, '')) LIKE '%esm%' THEN 'esm_adhoc'
            ELSE 'esm_adhoc'
          END),
          grading = COALESCE(${gradingValue}, grading),
          inspector_id = COALESCE(NULLIF(TRIM(inspector_id), ''), ${inspectorEmail}),
          inspector_name = COALESCE(NULLIF(TRIM(inspector_name), ''), ${inspectorName})
      WHERE id = ${id}
    `

    const refreshedResult = await sql`
      SELECT * FROM inspections WHERE id = ${id}
    `
    const inspectionLive = refreshedResult.rows[0] || inspection

    const actionCreationWarnings = []
    if (wasDraft) {
      try {
        if (isNv) {
          await createNeighbourhoodVoiceAutoActions(sql, {
            inspectionId: id,
            inspection: inspectionLive,
            templateVersion,
            answersRows: answersResult.rows,
          })
        } else if (isEstateWalkaboutTemplateVersion(templateVersion)) {
          try {
            const est = await sql`
              SELECT e.name AS estate_name
              FROM inspections i
              LEFT JOIN estates e ON e.id = i.estate_id
              WHERE i.id = ${id}
              LIMIT 1
            `
            const estateName = est.rows[0]?.estate_name || ''
            const wr = await createEstateWalkaboutActionsFromInspection(sql, {
              inspectionId: id,
              templateVersion,
              answersRows: answersResult.rows,
              answersMap: answers,
              estateName,
              inspectorName: inspectionLive.inspector_name || inspectorName,
              inspectorEmail,
              locationLine: estateBlockLine,
              submittedAt: inspectionLive.submitted_at || new Date().toISOString(),
              inspectionTypeLabel: templateVersion?.name || inspectionLive.template_name || '',
            })
            for (const w of wr.warnings || []) {
              actionCreationWarnings.push(w)
            }
          } catch (ewErr) {
            console.error('[inspections/submit] estate walkabout actions:', ewErr)
            actionCreationWarnings.push(
              `Estate walkabout actions: ${ewErr?.message || String(ewErr)}`
            )
          }
        } else if (isEsmInspectionFormTemplate(templateVersion)) {
          try {
            const er = await createEsmActionsFromInspection(sql, {
              inspectionId: id,
              templateVersion,
              answersRows: answersResult.rows,
              answersMap: answers,
              inspectorName: inspectionLive.inspector_name || inspectorName || inspectorEmail,
              locationLine: estateBlockLine,
              submittedAt: inspectionLive.submitted_at || new Date().toISOString(),
              blockId: inspectionLive.block_id || inspection.block_id || null,
            })
            for (const w of er.warnings || []) {
              actionCreationWarnings.push(w)
            }
          } catch (esmErr) {
            console.error('[inspections/submit] ESM actions:', esmErr)
            actionCreationWarnings.push(
              `ESM actions: ${esmErr?.message || String(esmErr)}`
            )
          }
        } else {
          const sections = (templateVersion && templateVersion.sections) || []
          const completedAt = new Date().toISOString()
          const inspectionBlockId = inspectionLive.block_id || inspection.block_id || null
          const caretakerScope = isCaretakerTemplate(templateVersion)
            ? resolveCaretakerInspectionScope(inspectionLive)
            : null
          for (const sec of sections) {
            if (!caretakerSectionInScope(sec, caretakerScope)) continue
            const recipientQ = findRecipientQuestion(sec.questions || [])
            const recipientId =
              recipientQ && answers[recipientQ.id] != null && answers[recipientQ.id] !== ''
                ? answers[recipientQ.id]
                : null
            const sectionCostCode = findSectionCostCodeAnswer(sec, answers)

            for (const q of sec.questions || []) {
              if (!q || !q.id) continue
              const val = answers[q.id]
              const answerRow = answersResult.rows.find((r) => r.question_id === q.id)
              const extras = parseCaretakerAnswerNotes(answerRow?.notes)
              const comment = extras.comment || ''
              const qText = q.question_text || q.label || q.id
              const norm = normalizeYesNoAnswer(val)
              const answerLabel = norm === 'yes' ? 'Yes' : norm === 'no' ? 'No' : String(val ?? '')
              const photosResult = await sql`
                SELECT id, blob_url FROM inspection_photos
                WHERE inspection_id = ${id} AND question_id = ${q.id}
              `
              const dbPhotoUrls = photosResult.rows.map((p) => p.blob_url).filter(Boolean)
              const photoUrlsArr = [...new Set([...dbPhotoUrls, ...extras.extraPhotoUrls, ...collectEsmIdCardPhotoUrlsFromExtras(extras)])]
              const photoRefs = photoUrlsArr.join('; ')
              if (!extras.raiseIssue && !shouldAutocreateCaretakerAction(q, val, sec)) continue
              const category = safeActionText(q.action_category || q.category, 'other', 50)
              const existing = await sql`
                SELECT id FROM actions
                WHERE inspection_id = ${id} AND question_id = ${q.id}
                LIMIT 1
              `
              if (existing.rows.length > 0) continue
              const costCode = extras.costCode || sectionCostCode || null
              let actionRecipient =
                (extras.recipient_person_id && String(extras.recipient_person_id).trim()) ||
                (recipientId != null ? String(recipientId).trim() : '') ||
                null
              const recipientResolution = await resolveIssueRecipientForAction(sql, {
                recipientPersonId: actionRecipient,
                issueCategory: category,
                issueType: q.issue_type ? String(q.issue_type) : null,
                estateId: inspectionLive.estate_id || inspection.estate_id || null,
                assignToRoleFallback: null,
                allowRoutingFallback: !isGroundsMaintenanceSubmission,
              })
              if (recipientResolution.warning) {
                actionCreationWarnings.push(recipientResolution.warning)
                continue
              }
              actionRecipient = recipientResolution.personId || null
              const priorityVal = extras.priority || q.action_priority || null
              const title = safeActionText(`${sec.title || sec.name || 'Section'} – ${qText}`, qText, 500)
              const description = buildCaretakerActionDescription({
                inspectionId: id,
                completedAtIso: completedAt,
                estateBlockLine,
                sectionName: sec.title || sec.name || '',
                questionText: qText,
                answerLabel,
                comment,
                photoRefs,
                category,
                assigneeLabel: actionRecipient ? `Person id ${actionRecipient}` : '',
                submittedBy: inspectionLive.inspector_name || inspectorName || inspectorEmail || '',
              })
              const actionId = `action_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
              try {
                await insertActionWithOptionalColumns(sql, {
                  fields: [
                    ['id', actionId],
                    ['inspection_id', id],
                    ['section_id', sec.id],
                    ['section_name', sec.title || sec.name],
                    ['question_id', q.id],
                    ['category', category],
                    ['priority', priorityVal],
                    ['title', title],
                    ['description', description],
                    ['location', estateBlockLine || null],
                    ['status', 'open'],
                    ['comment', comment || null],
                    ['recipient_person_id', actionRecipient],
                    ['auto_created', true],
                    ['photo_urls', JSON.stringify(photoUrlsArr)],
                  ],
                  optionalFields: [
                    ['block_id', inspectionBlockId],
                    ['cost_code', costCode],
                  ],
                })
              } catch (insertErr) {
                console.error('[inspections/submit] caretaker action insert failed:', insertErr)
                actionCreationWarnings.push(
                  isRecipientPersonFkError(insertErr)
                    ? ISSUE_RECIPIENT_UNAVAILABLE_MESSAGE
                    : `Could not create action for this question. Please review the action list and assign a recipient manually if needed.`
                )
                continue
              }
              try {
                const team = await formatAssignedTeamLabel(sql, actionRecipient)
                const detail = [comment, description].filter(Boolean).join('\n\n').slice(0, 2500)
                const issueTypeLabel = String(category || 'issue').replace(/_/g, ' ')
                const pdfR = await tryGenerateAndStoreIssueJobCardPdf(sql, {
                  actionId,
                  inspectionId: id,
                  inspectionType: inspectionLive.template_name || 'Inspection',
                  blockEstate: estateBlockLine || '—',
                  location: estateBlockLine || '—',
                  exactLocation: estateBlockLine || '—',
                  dateRaised: formatDateGb(completedAt),
                  dateSent: formatDateGb(completedAt),
                  issueTitle: title,
                  issueType: issueTypeLabel,
                  issueDetail: detail,
                  priority: priorityVal ? String(priorityVal).replace(/_/g, ' ') : 'As assessed',
                  assignedTeam: team,
                  targetCompletionDate: 'TBC',
                  jobNumber: 'Pending assignment',
                  status: 'Open',
                  photoUrls: photoUrlsArr,
                })
                if (!pdfR?.ok) {
                  actionCreationWarnings.push(
                    `Issue job card PDF not saved for action ${actionId}: ${pdfR?.error || 'unknown'}`
                  )
                }
              } catch (pdfErr) {
                console.error('[inspections/submit] issue job card PDF:', pdfErr)
                actionCreationWarnings.push(
                  `Issue job card PDF failed for ${actionId}: ${pdfErr?.message || String(pdfErr)}`
                )
              }
            }

            for (const q of sec.questions || []) {
              if (!q || !q.id) continue
              if (resolveStoredQuestionType(q) !== 'graded') continue
              const gradeVal = answers[q.id]
              if (!shouldAutocreateCaretakerGradedAction(q, gradeVal)) continue
              const existingG = await sql`
                SELECT id FROM actions
                WHERE inspection_id = ${id} AND question_id = ${q.id} AND status = 'open'
                LIMIT 1
              `
              if (existingG.rows.length > 0) continue
              const answerRow = answersResult.rows.find((r) => r.question_id === q.id)
              const extras = parseCaretakerAnswerNotes(answerRow?.notes)
              const comment = extras.comment || ''
              const category = q.action_category || q.category || 'other'
              const qText = q.question_text || q.label || q.id
              const answerLabel = String(gradeVal ?? '').trim() || '—'
              const photosResult = await sql`
                SELECT id, blob_url FROM inspection_photos
                WHERE inspection_id = ${id} AND question_id = ${q.id}
              `
              const dbPhotoUrls = photosResult.rows.map((p) => p.blob_url).filter(Boolean)
              const photoUrlsArr = [...new Set([...dbPhotoUrls, ...extras.extraPhotoUrls, ...collectEsmIdCardPhotoUrlsFromExtras(extras)])]
              const photoRefs = photoUrlsArr.join('; ')
              const costCode = extras.costCode || sectionCostCode || null
              let actionRecipient =
                (extras.recipient_person_id && String(extras.recipient_person_id).trim()) ||
                (recipientId != null ? String(recipientId).trim() : '') ||
                null
              const recipientResolution = await resolveIssueRecipientForAction(sql, {
                recipientPersonId: actionRecipient,
                issueCategory: category,
                issueType: q.issue_type ? String(q.issue_type) : null,
                estateId: inspectionLive.estate_id || inspection.estate_id || null,
                assignToRoleFallback: null,
                allowRoutingFallback: !isGroundsMaintenanceSubmission,
              })
              if (recipientResolution.warning) {
                actionCreationWarnings.push(recipientResolution.warning)
                continue
              }
              actionRecipient = recipientResolution.personId || null
              const priorityVal = extras.priority || q.action_priority || null
              const title = `${sec.title || sec.name || 'Section'} – ${qText} (grade ${answerLabel})`
              const description = buildCaretakerActionDescription({
                inspectionId: id,
                completedAtIso: completedAt,
                estateBlockLine,
                sectionName: sec.title || sec.name || '',
                questionText: qText,
                answerLabel,
                comment,
                photoRefs,
                category,
                assigneeLabel: actionRecipient ? `Person id ${actionRecipient}` : '',
                submittedBy: inspectionLive.inspector_name || inspectorName || inspectorEmail || '',
              })
              const actionId = `action_${id}_${q.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
              try {
                await insertActionWithOptionalColumns(sql, {
                  fields: [
                    ['id', actionId],
                    ['inspection_id', id],
                    ['section_id', sec.id],
                    ['section_name', sec.title || sec.name],
                    ['question_id', q.id],
                    ['category', category],
                    ['priority', priorityVal],
                    ['title', title],
                    ['description', description],
                    ['location', estateBlockLine || null],
                    ['status', 'open'],
                    ['comment', comment || null],
                    ['recipient_person_id', actionRecipient],
                    ['auto_created', true],
                    ['photo_urls', JSON.stringify(photoUrlsArr)],
                  ],
                  optionalFields: [
                    ['block_id', inspectionBlockId],
                    ['cost_code', costCode],
                  ],
                })
              } catch (insertErr) {
                console.error('[inspections/submit] graded caretaker action insert failed:', insertErr)
                actionCreationWarnings.push(
                  isRecipientPersonFkError(insertErr)
                    ? ISSUE_RECIPIENT_UNAVAILABLE_MESSAGE
                    : `Could not create action for this question. Please review the action list and assign a recipient manually if needed.`
                )
                continue
              }
              try {
                const teamG = await formatAssignedTeamLabel(sql, actionRecipient)
                const detailG = [comment, description, `Grade: ${answerLabel}`].filter(Boolean).join('\n\n').slice(0, 2500)
                const issueTypeGraded = String(category || 'issue').replace(/_/g, ' ')
                const pdfG = await tryGenerateAndStoreIssueJobCardPdf(sql, {
                  actionId,
                  inspectionId: id,
                  inspectionType: inspectionLive.template_name || 'Inspection',
                  blockEstate: estateBlockLine || '—',
                  location: estateBlockLine || '—',
                  exactLocation: estateBlockLine || '—',
                  dateRaised: formatDateGb(completedAt),
                  dateSent: formatDateGb(completedAt),
                  issueTitle: title,
                  issueType: `${issueTypeGraded} (grade ${answerLabel})`,
                  issueDetail: detailG,
                  priority: priorityVal ? String(priorityVal).replace(/_/g, ' ') : `Grade ${answerLabel}`,
                  assignedTeam: teamG,
                  targetCompletionDate: 'TBC',
                  jobNumber: 'Pending assignment',
                  status: 'Open',
                  photoUrls: photoUrlsArr,
                })
                if (!pdfG?.ok) {
                  actionCreationWarnings.push(
                    `Issue job card PDF not saved for action ${actionId}: ${pdfG?.error || 'unknown'}`
                  )
                }
              } catch (pdfErr) {
                console.error('[inspections/submit] graded issue job card PDF:', pdfErr)
                actionCreationWarnings.push(
                  `Issue job card PDF failed for ${actionId}: ${pdfErr?.message || String(pdfErr)}`
                )
              }
            }
          }
        }
      } catch (draftActionErr) {
        console.error('[inspections/submit] draft action creation failed:', draftActionErr)
        actionCreationWarnings.push(
          `Action creation had errors: ${draftActionErr?.message || String(draftActionErr)}`
        )
      }
    }

    // Get all actions (for PDF poster and emails) — must not 500 the response after submit
    let allActions = []
    try {
      const allActionsResult = await sql`
        SELECT 
          a.*,
          p.email as recipient_email,
          p.name as recipient_name
        FROM actions a
        LEFT JOIN people p ON a.recipient_person_id = p.id
        WHERE a.inspection_id = ${id} AND a.status = 'open'
        ORDER BY a.category, a.created_at
      `
      allActions = allActionsResult.rows
    } catch (loadActionsErr) {
      console.error('[inspections/submit] loading actions for poster/email failed:', loadActionsErr)
      actionCreationWarnings.push(
        `Could not load open actions for this inspection: ${loadActionsErr?.message || String(loadActionsErr)}`
      )
    }

    // Generate the full inspection report PDF at submit time so the Housing
    // Officer confirmation email can link to the completed report. Previously
    // the full report was only built on demand, leaving submit-time emails
    // without a report link. ensureFullInspectionPdf handles its own errors and
    // returns { ok, url }; the extra try/catch guarantees a PDF failure can
    // never block an already-submitted inspection.
    let fullPdfUrl = getInspectionFullReportPdfUrl(inspectionLive)
    try {
      const fullPdfResult = await ensureFullInspectionPdf(sql, { inspectionId: id })
      if (fullPdfResult?.ok && fullPdfResult.url) {
        fullPdfUrl = fullPdfResult.url
        console.log('[inspections/submit] full report PDF ready', {
          inspectionId: id,
          generated: fullPdfResult.generated === true,
        })
      } else if (fullPdfResult && !fullPdfResult.ok) {
        console.error('[inspections/submit] full report PDF generation failed', {
          inspectionId: id,
          error: fullPdfResult.error || 'unknown',
        })
        actionCreationWarnings.push(
          `Full report PDF could not be generated: ${fullPdfResult.error || 'unknown error'}`
        )
      }
    } catch (fullPdfErr) {
      console.error('[inspections/submit] full report PDF generation threw', {
        inspectionId: id,
        error: fullPdfErr?.message || String(fullPdfErr),
      })
      actionCreationWarnings.push(
        `Full report PDF could not be generated: ${fullPdfErr?.message || String(fullPdfErr)}`
      )
    }
    let posterPdfUrl = inspectionLive.poster_pdf_url || null
    let pdfError = null
    try {
      if (allActions.length > 0) {
        try {
          const posterPdfBytes = await generatePosterPdfBuffer(
            {
              ...inspectionLive,
              estate_block_name: estateBlockLine,
            },
            allActions
          )
          posterPdfUrl = await uploadInspectionPdfToBlob({
            inspectionId: id,
            pdfBytes: posterPdfBytes,
            kind: 'poster',
          })
        } catch (posterErr) {
          console.error('[inspections/submit] poster PDF failed:', posterErr)
          pdfError = posterErr?.message || String(posterErr)
        }
      }

      const truncatedErr = pdfError && pdfError.length > 2000 ? pdfError.slice(0, 2000) : pdfError
      await sql`
        UPDATE inspections
        SET poster_pdf_url = COALESCE(${posterPdfUrl}, poster_pdf_url),
            pdf_generation_error = ${truncatedErr}
        WHERE id = ${id}
      `
    } catch (pdfErr) {
      pdfError = pdfErr?.message || String(pdfErr)
      console.error('[inspections/submit] poster PDF update failed:', pdfError)
      const truncated = pdfError.length > 2000 ? pdfError.slice(0, 2000) : pdfError
      await sql`
        UPDATE inspections
        SET pdf_generation_error = ${truncated}
        WHERE id = ${id}
      `
    }

    // Extract recipients from persisted template snapshot (no live Airtable dependency)
    let recipients = []
    let emailVersion = inspectionLive.template_version
    if (typeof emailVersion === 'string') {
      try {
        emailVersion = JSON.parse(emailVersion)
      } catch {
        emailVersion = null
      }
    }
    if (emailVersion && typeof emailVersion === 'object') {
      applyGroundsMaintenanceTemplateToSnapshot(emailVersion)
      applyNeighbourhoodVoiceTemplatePatch(emailVersion)
      applyTemplateDisplayPatches(emailVersion)
    }
    const versionSections = (emailVersion && emailVersion.sections) || []
    const allQuestions = versionSections.flatMap((sec) => sec.questions || [])
    if (allQuestions.length > 0) {
      recipients = extractCaretakerRecipients(answers, allQuestions)
      if (recipients.length === 0) {
        const recipientQuestion = findRecipientQuestion(allQuestions)
        if (recipientQuestion && answers[recipientQuestion.id]) {
          recipients = [answers[recipientQuestion.id]]
        }
      }
    }
    
    // Get actions grouped by category (must not fail the HTTP response after inspection is submitted)
    let actionsResult = { rows: [] }
    try {
      actionsResult = await sql`
        SELECT 
          category, 
          COUNT(*) as count,
          STRING_AGG(DISTINCT section_name || ' – ' || title, '; ') as action_list
        FROM actions 
        WHERE inspection_id = ${id} AND status = 'open'
        GROUP BY category
      `
    } catch (actionsAggErr) {
      console.error('[inspections/submit] actions aggregation query failed:', actionsAggErr)
      actionCreationWarnings.push(
        `Could not aggregate actions for email context: ${actionsAggErr?.message || String(actionsAggErr)}`
      )
    }

    // Send emails only on the first submit attempt. Retries for an already-submitted inspection
    // should not resend notifications just because a best-effort logging/audit step failed.
    let emailResults = { sent: [], failed: [] }
    if (wasDraft && !isGroundsMaintenanceSubmission) {
      try {
        emailResults = await sendEmails({
          sql,
          inspectionId: id,
          inspection: {
            ...inspectionLive,
            full_pdf_url: fullPdfUrl ?? inspectionLive.full_pdf_url ?? null,
            poster_pdf_url: posterPdfUrl ?? inspectionLive.poster_pdf_url ?? null,
          },
          estateBlockLine,
          fullPdfUrl,
          posterPdfUrl,
          recipients,
          actionCategories: actionsResult.rows,
          allActions,
        })
      } catch (emailErr) {
        console.error('[inspections/submit] sendEmails threw:', emailErr)
        actionCreationWarnings.push(`Email sending error: ${emailErr?.message || String(emailErr)}`)
      }

      if (emailVersion && isCaretakerTemplate(emailVersion)) {
        try {
          const caretakerScope = resolveCaretakerInspectionScope(inspectionLive)
          const caretakerEmails = await sendCaretakerPhotoAndYesNotifications({
            inspectionId: id,
            templateVersion: emailVersion,
            answers,
            answerRows: answersResult.rows,
            inspectorEmail,
            inspectionTitle: inspectionLive.template_name || inspectionLive.title || 'Caretaker inspection',
            locationLine: estateBlockLine,
            scope: caretakerScope,
          })
          if (Array.isArray(caretakerEmails.sent)) {
            emailResults.sent.push(...caretakerEmails.sent)
          }
          if (Array.isArray(caretakerEmails.failed)) {
            emailResults.failed.push(...caretakerEmails.failed)
          }
        } catch (caretakerEmailErr) {
          console.error('[inspections/submit] caretaker notifications:', caretakerEmailErr)
          actionCreationWarnings.push(`Caretaker notification error: ${caretakerEmailErr?.message || String(caretakerEmailErr)}`)
        }
      }

      if (emailVersion && isEstateWalkaboutTemplateVersion(emailVersion)) {
        try {
          const answerExtras = await enrichAnswerExtrasWithDbPhotos(
            sql,
            id,
            buildAnswerExtrasMapFromRows(answersResult.rows),
            ['ew_it_bulk_refuse_removal']
          )
          const estRow = await sql`
            SELECT e.name AS estate_name
            FROM inspections i
            LEFT JOIN estates e ON e.id = i.estate_id
            WHERE i.id = ${id}
            LIMIT 1
          `
          const bulkEmailResult = await sendBulkRefuseWalkaboutEmail(sql, {
            request,
            inspectionId: id,
            estateName: estRow.rows[0]?.estate_name || '',
            locationLine: estateBlockLine,
            answers,
            answerExtras,
            posterPdfUrl,
            submittedAt: inspectionLive.submitted_at || submittedAtForTiming.toISOString(),
          })
          if ((bulkEmailResult.sent || 0) > 0 && bulkEmailResult.email) {
            emailResults.sent.push({ email: bulkEmailResult.email, type: 'estate_walkabout_bulk_refuse' })
          }
          if (Array.isArray(bulkEmailResult.failed)) {
            emailResults.failed.push(...bulkEmailResult.failed)
          }
        } catch (walkaboutEmailErr) {
          console.error('[inspections/submit] walkabout bulk refuse notification:', walkaboutEmailErr)
          actionCreationWarnings.push(
            `Walkabout bulk refuse notification: ${walkaboutEmailErr?.message || String(walkaboutEmailErr)}`
          )
        }
      }

      if (emailVersion && isEsmInspectionFormTemplate(emailVersion)) {
        try {
          const esmEmails = await sendEsmPhotoAndYesNotifications({
            inspectionId: id,
            templateVersion: emailVersion,
            answers,
            answerRows: answersResult.rows,
            inspectionTitle: inspectionLive.template_name || inspectionLive.title || 'ESM inspection',
            locationLine: estateBlockLine,
          })
          if (Array.isArray(esmEmails.sent)) {
            emailResults.sent.push(...esmEmails.sent)
          }
          if (Array.isArray(esmEmails.failed)) {
            emailResults.failed.push(...esmEmails.failed)
          }
        } catch (esmEmailErr) {
          console.error('[inspections/submit] ESM notifications:', esmEmailErr)
          actionCreationWarnings.push(`ESM notification error: ${esmEmailErr?.message || String(esmEmailErr)}`)
        }
      }
    } else {
      console.log('[inspections/submit] skipping notification resend for already-submitted inspection', { inspectionId: id })
    }

    if (wasDraft) {
      try {
        const confirmationResult = await sendInspectionSubmissionConfirmationEmail({
          sql,
          inspectionId: id,
          inspection: inspectionLive,
          templateVersion: emailVersion,
          inspectorEmail: inspectorEmail || inspectionLive.inspector_id,
          inspectorName: inspectionLive.inspector_name || inspectorName,
          estateBlockLine,
          fullPdfUrl: fullPdfUrl ?? getInspectionFullReportPdfUrl(inspectionLive) ?? null,
          posterPdfUrl: posterPdfUrl ?? inspectionLive.poster_pdf_url ?? null,
        })
        if (confirmationResult.ok && !confirmationResult.skipped) {
          emailResults.sent.push({
            email: confirmationResult.to,
            type: 'inspection_submission_confirmation',
          })
        } else if (!confirmationResult.ok && !confirmationResult.skipped) {
          emailResults.failed.push({
            email: confirmationResult.to || inspectorEmail,
            error: confirmationResult.error || 'inspection_submission_confirmation_failed',
          })
        }
      } catch (confirmationErr) {
        console.error('[inspections/submit] submission confirmation:', confirmationErr)
        actionCreationWarnings.push(
          `Submission confirmation: ${confirmationErr?.message || String(confirmationErr)}`
        )
      }
    }

    // Save recipient records (best-effort — inspection is already submitted)
    const sentList = Array.isArray(emailResults?.sent) ? emailResults.sent : []
    const sendCount = sentList.length
    const failureList = Array.isArray(emailResults?.failed) ? emailResults.failed : []
    console.log('[inspections/submit] inspection id', { inspectionId: id })
    console.log('[inspections/submit] emails_sent', { inspectionId: id, count: sendCount })
    console.log('[inspections/submit] email_failures', { inspectionId: id, count: failureList.length, failures: failureList })

    for (let i = 0; i < sentList.length; i++) {
      const recipient = sentList[i]
      const emailAddr = recipient?.email != null ? String(recipient.email).trim() : ''
      if (!emailAddr) {
        actionCreationWarnings.push('Skipped saving an inspection_recipients row (missing email on sent record).')
        continue
      }
      try {
        const rid = `recipient_${id}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 11)}`
        await sql`
          INSERT INTO inspection_recipients (
            id, inspection_id, person_id, person_email, recipient_type, sent_at
          ) VALUES (
            ${rid},
            ${id},
            ${recipient.person_id || null},
            ${emailAddr},
            ${recipient.type || 'targeted'},
            CURRENT_TIMESTAMP
          )
        `
      } catch (recErr) {
        console.error('[inspections/submit] inspection_recipients insert failed:', recErr)
        actionCreationWarnings.push(
          `Could not save recipient audit row (${emailAddr}): ${recErr?.message || String(recErr)}`
        )
      }
    }

    const warnings = [
      ...(failureList.length > 0 ? ['One or more notification emails failed to send.'] : []),
      ...(actionCreationWarnings.length > 0 ? actionCreationWarnings : []),
      ...(pdfError ? [`PDF warning: ${pdfError}`] : []),
    ]

    return NextResponse.json(
      {
        inspectionId: id,
        pdfUrl: fullPdfUrl || null,
        fullPdfUrl: fullPdfUrl || null,
        posterPdfUrl: posterPdfUrl || null,
        emails_sent: sendCount,
        ...(failureList.length > 0
          ? { email_failures: failureList }
          : {}),
        ...(actionCreationWarnings.length > 0 ? { action_creation_warnings: actionCreationWarnings } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(pdfError ? { pdfError } : {}),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error submitting inspection:', error)
    return NextResponse.json(
      { error: 'Failed to submit inspection', details: error.message },
      { status: 500 }
    )
  }
}
