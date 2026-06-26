/**
 * Estate Walkabout: actions only when checklist item has action_required.
 * Payload includes inspection id, estate, item description, status, comments, photos, user.
 */

import {
  ESTATE_WALKABOUT_CHECKLIST_QID,
  isEstateWalkaboutTemplate,
  isEstateWalkaboutTemplateVersion,
} from '@/lib/estate-walkabout-template'
import {
  parseTriggersIssueAnswerList,
  normalizeGradeAnswerToken,
  normalizeIssueTriggerToken,
  normalizeYesNoAnswer,
} from '@/lib/issue-trigger-answer'
import { getActionTriggerOn } from '@/lib/template-rules'
import {
  tryGenerateAndStoreIssueJobCardPdf,
  formatDateGb,
} from '@/lib/issue-job-card-upload'
import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'

function safeParseChecklist(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isRepairRelatedWalkaboutAction(item) {
  const blob = `${item?.description || ''} ${item?.action_summary || ''}`.toLowerCase()
  if (!blob.trim()) return false
  return /repair|defect|broken|damaged|leak|overflow|door|light|lighting|lift|glazing|window|roof|tank|intake|riser|chute|drain|gulley|trip|slip|road|parking|garage|shed|graffiti|sign|play|bulk|vehicle/.test(blob)
}

const WALKABOUT_ISSUE_ON_YES_QIDS = new Set([
  'ew_it_bulk_refuse_removal',
  'ew_it_tripping_hazards',
  'ew_it_abandoned_vehicles',
  'ew_it_overflows',
  'ew_it_graffiti',
])

function isEstateWalkaboutItemQuestion(question) {
  if (!question || typeof question.id !== 'string') return false
  return (
    question.question_type === 'yes_no' &&
    question.id.startsWith('ew_it_')
  )
}

function getWalkaboutItemTriggerDirection(question) {
  if (!isEstateWalkaboutItemQuestion(question)) return null
  return WALKABOUT_ISSUE_ON_YES_QIDS.has(question.id) ? 'yes' : 'no'
}

function inspectionAnswerTriggersWalkaboutItemIssue(question, section, answer) {
  const triggers = parseTriggersIssueAnswerList(question)
  if (triggers && triggers.length > 0) {
    const token = normalizeIssueTriggerToken(answer) || normalizeGradeAnswerToken(answer)
    return token ? triggers.includes(token) : false
  }

  const norm = normalizeYesNoAnswer(answer)
  if (!norm) return false

  const walkaboutDirection = getWalkaboutItemTriggerDirection(question)
  const direction = walkaboutDirection || getActionTriggerOn(question, section)
  if (direction === 'yes') {
    return norm === 'yes' && (question.create_action_on_yes !== false || walkaboutDirection === 'yes')
  }
  return norm === 'no' && (question.create_action_on_no !== false || walkaboutDirection === 'no')
}

async function collectInspectionPhotosByQuestionId(sql, inspectionId) {
  const results = await sql`
    SELECT question_id, blob_url
    FROM inspection_photos
    WHERE inspection_id = ${inspectionId}
  `
  const photos = {}
  for (const row of results.rows || []) {
    const questionId = String(row.question_id || '').trim()
    const url = String(row.blob_url || '').trim()
    if (!questionId || !url) continue
    photos[questionId] = photos[questionId] || []
    if (!photos[questionId].includes(url)) {
      photos[questionId].push(url)
    }
  }
  return photos
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

function buildWalkaboutItemActionText({ sectionName, questionText, answer, comment, exactLocation }) {
  return [
    sectionName ? `Section: ${sectionName}` : '',
    questionText ? `Item: ${questionText}` : '',
    answer !== undefined && answer !== null && String(answer).trim() ? `Response: ${String(answer).trim()}` : '',
    exactLocation ? `Exact location: ${exactLocation}` : '',
    comment ? `Comment: ${comment}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function createEstateWalkaboutActionsFromInspectionItems(sql, opts) {
  const {
    inspectionId,
    templateVersion,
    answersMap = {},
    answerExtras = {},
    estateName = '',
    inspectorName = '',
    locationLine = '',
    submittedAt = null,
    inspectionTypeLabel = '',
    estateId = null,
    responsiblePersonId = null,
    repairsOfficerPersonId = null,
  } = opts

  const walkaboutRecipientScope = {
    estateId,
    responsiblePersonId: responsiblePersonId || answersMap.ew_q_responsible || null,
    repairsOfficerPersonId: repairsOfficerPersonId || answersMap.ew_st_repairs_officer_select || null,
  }

  const photoMap = await collectInspectionPhotosByQuestionId(sql, inspectionId)
  const warnings = []
  const actions = []
  let created = 0

  for (const section of templateVersion.sections || []) {
    for (const q of section.questions || []) {
      if (!isEstateWalkaboutItemQuestion(q)) continue

      const answer = answersMap[q.id]
      if (answer === undefined || answer === null) continue
      if (!inspectionAnswerTriggersWalkaboutItemIssue(q, section, answer)) continue

      const isBulkRefuse = q.id === 'ew_it_bulk_refuse_removal'
      const comment = String(
        isBulkRefuse ? answersMap.ew_it_bulk_refuse_comments || '' : answersMap[`${q.id}_comment`] || ''
      ).trim()
      const exactLocation = String(isBulkRefuse ? answersMap.ew_it_bulk_refuse_exact_location || '' : '').trim()
      const dbPhotoUrls = Array.isArray(photoMap[q.id]) ? photoMap[q.id] : []
      const extraPhotoUrls = collectPhotoUrlsFromExtras(answerExtras[q.id])
      const photoUrls = [...new Set([...dbPhotoUrls, ...extraPhotoUrls])]
      const actionLocation = exactLocation
        ? [locationLine || estateName, exactLocation].filter(Boolean).join(' - ')
        : locationLine || estateName || null

      try {
        const existing = await sql`
          SELECT id FROM actions
          WHERE inspection_id = ${inspectionId} AND question_id = ${q.id}
          LIMIT 1
        `
        if (existing.rows.length > 0) continue

        const sectionName = section.title || section.name || 'Item inspections'
        const questionText = q.question_text || q.label || q.id
        const residentMessage = comment || `Response: ${String(answer).trim() || 'Issue identified'}`
        const category = q.action_category || q.category || 'estate_walkabout'
        const title = `${sectionName} - ${questionText}`.slice(0, 500)
        const description = buildWalkaboutItemActionText({
          sectionName,
          questionText,
          answer,
          comment,
          exactLocation,
        })
        const actionId = `action_${inspectionId}_${q.id}_${Date.now()}`

        await sql`
          INSERT INTO actions (
            id, inspection_id, section_id, section_name, question_id,
            category, priority, title, description, location, status,
            comment, auto_created, photo_urls
          )
          VALUES (
            ${actionId}, ${inspectionId}, ${section.id}, ${sectionName}, ${q.id},
            ${category}, null, ${title}, ${description}, ${actionLocation}, 'open',
            ${comment || residentMessage || null}, true, ${JSON.stringify(photoUrls)}
          )
        `

        created += 1
        console.log('[estate-walkabout-actions] Created action for inspection:', { actionId, inspectionId, questionId: q.id, category })

        const actionPlanPdf = await tryGenerateAndStoreIssueJobCardPdf(sql, {
          actionId,
          inspectionId,
          inspectionType: inspectionTypeLabel || templateVersion?.name || 'Estate walkabout',
          blockEstate: locationLine || estateName || '',
          location: locationLine || estateName || '',
          exactLocation: actionLocation || locationLine || estateName || '',
          dateRaised: formatDateGb(submittedAt || new Date().toISOString()),
          dateSent: formatDateGb(submittedAt || new Date().toISOString()),
          issueTitle: title,
          issueType: String(category || 'Issue').replace(/_/g, ' '),
          issueDetail: description.slice(0, 2500),
          priority: 'As reported',
          assignedTeam: '—',
          targetCompletionDate: 'TBC',
          jobNumber: 'Pending assignment',
          status: 'Open',
          photoUrls,
        })

        if (actionPlanPdf?.url) {
          try {
            await sql`UPDATE actions SET issue_pdf_url = ${actionPlanPdf.url} WHERE id = ${actionId}`
          } catch (urlErr) {
            console.warn('[estate-walkabout-actions] could not save issue_pdf_url:', urlErr?.message || urlErr)
          }
        }

        actions.push({
          id: actionId,
          category,
          title,
          description,
          comment: comment || residentMessage || null,
          location: actionLocation,
          status: 'open',
          photo_urls: photoUrls,
          issue_pdf_url: actionPlanPdf?.url || null,
          created_at: new Date(),
        })

        if (isRepairRelatedWalkaboutAction({ description, action_summary: residentMessage, photo_urls: photoUrls })) {
          try {
            const notify = await sendEstateWalkaboutRepairActionNotification(sql, {
              inspectionId,
              questionId: q.id,
              actionTitle: title,
              actionPlanPdfUrl: actionPlanPdf?.url || null,
              estateName,
              locationLine: actionLocation || locationLine,
              submittedAt,
              inspectorName,
              description,
              actionSummary: residentMessage,
              photoUrls,
              estateId: walkaboutRecipientScope.estateId,
              responsiblePersonId: walkaboutRecipientScope.responsiblePersonId,
              repairsOfficerPersonId: walkaboutRecipientScope.repairsOfficerPersonId,
            })
            if (notify?.failed) {
              // do not block action creation by email failures
            }
          } catch (notifyErr) {
            warnings.push(`Walkabout action email failed for ${q.id}: ${notifyErr?.message || String(notifyErr)}`)
          }
        }
      } catch (actionErr) {
        warnings.push(`Could not create walkabout action for ${q.id}: ${actionErr?.message || String(actionErr)}`)
      }
    }
  }

  return { created, warnings, actions }
}

/**
 * Safe fallback mailbox for walkabout action emails when no scoped recipient resolves.
 * Configured via env so we never broadcast to every Housing Officer.
 */
const WALKABOUT_ACTION_FALLBACK_EMAIL = String(
  process.env.WALKABOUT_ACTION_FALLBACK_EMAIL ||
    process.env.ESTATE_WALKABOUT_FALLBACK_EMAIL ||
    process.env.REPAIRS_EMAIL ||
    ''
).trim()

/** Resolve specific, active people by id (e.g. the officers selected on the walkabout). */
async function resolveActiveWalkaboutOfficers(sql, ids) {
  const cleaned = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))]
  const out = []
  for (const id of cleaned) {
    try {
      const res = await sql`
        SELECT id, name, email, role, job_title
        FROM people
        WHERE id = ${id}
          AND COALESCE(active, true) = true
          AND email IS NOT NULL
          AND trim(email) <> ''
        LIMIT 1
      `
      if (res.rows[0]) out.push(res.rows[0])
    } catch (error) {
      console.warn('[estate-walkabout-actions] officer lookup failed:', error?.message || error)
    }
  }
  return out
}

/**
 * Resolve recipients for a walkabout repair/action email.
 * Scoped — never broadcasts to all Housing Officers.
 * Resolution order (deduped by email):
 *   1. Officers explicitly selected on this walkabout (responsible / repairs officer).
 *   2. Estate-scoped service routing rules (only when the estate is known).
 *   3. A single safe configured fallback mailbox if nothing scoped resolved.
 *
 * @param {import('@vercel/postgres').Sql} sql
 * @param {{ estateId?: string|null, responsiblePersonId?: string|null, repairsOfficerPersonId?: string|null }} [scope]
 */
async function findWalkaboutRepairRecipients(sql, scope = {}) {
  const {
    estateId = null,
    responsiblePersonId = null,
    repairsOfficerPersonId = null,
  } = scope || {}

  const recipients = []
  const seen = new Set()
  const addRecipient = (row, source) => {
    const email = String(row?.email || '').trim()
    if (!email) return
    const key = email.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    recipients.push({
      id: row.id ?? null,
      name: row.name ?? null,
      email,
      role: row.role ?? null,
      job_title: row.job_title ?? null,
      source,
    })
  }

  // 1) Officers explicitly selected on this walkabout (deterministic + scoped).
  const selectedOfficers = await resolveActiveWalkaboutOfficers(sql, [
    responsiblePersonId,
    repairsOfficerPersonId,
  ])
  for (const officer of selectedOfficers) addRecipient(officer, 'form_selected_officer')

  // 2) Estate-scoped service routing rules — only applied when the estate is known.
  if (estateId) {
    try {
      const routed = await sql`
        SELECT DISTINCT p.id, p.name, p.email, p.role, p.job_title
        FROM issue_routing_rules r
        JOIN people p ON (
          (r.assign_to_person_id IS NOT NULL AND p.id = r.assign_to_person_id)
          OR (r.assign_to_role IS NOT NULL AND (p.job_title = r.assign_to_role OR p.role = r.assign_to_role))
        )
        WHERE r.active = true
          AND r.email_required = true
          AND r.issue_category IN ('repairs', 'lighting', 'parking_abandoned_vehicle', 'tenancy_management')
          AND r.estate_id = ${estateId}
          AND COALESCE(p.active, true) = true
          AND p.email IS NOT NULL
          AND trim(p.email) <> ''
        ORDER BY p.name ASC, p.email ASC
      `
      for (const row of routed.rows || []) addRecipient(row, 'estate_routing_rule')
    } catch (error) {
      console.warn('[estate-walkabout-actions] estate routing rule lookup failed:', error?.message || error)
    }
  }

  // 3) Safe configured fallback mailbox — never fall back to all Housing Officers.
  if (recipients.length === 0 && WALKABOUT_ACTION_FALLBACK_EMAIL) {
    addRecipient({ email: WALKABOUT_ACTION_FALLBACK_EMAIL, name: 'Estate Walkabout mailbox' }, 'fallback_mailbox')
  }

  const sourceCounts = recipients.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1
    return acc
  }, {})
  console.log('[estate-walkabout-actions] repair recipient resolution', {
    hasResponsibleOfficer: Boolean(responsiblePersonId),
    hasRepairsOfficer: Boolean(repairsOfficerPersonId),
    estateScoped: Boolean(estateId),
    fallbackConfigured: Boolean(WALKABOUT_ACTION_FALLBACK_EMAIL),
    recipientCount: recipients.length,
    sources: sourceCounts,
  })

  return recipients
}

async function logWalkaboutEmail(sql, { inspectionId, questionId, emailTo, routing, status }) {
  try {
    await insertOutboundEmailLog(sql, {
      inspectionId,
      questionId,
      emailTo,
      emailRouting: routing,
      status,
      sentAt: status === 'sent' ? new Date() : null,
    })
  } catch (error) {
    console.warn('[estate-walkabout-actions] email log failed:', error?.message || error)
  }
}

async function sendWalkaboutRepairActionEmail(sql, {
  inspectionId,
  questionId,
  item,
  actionTitle,
  actionPlanPdfUrl,
  recipients,
  estateName,
  locationLine,
  submittedAt,
  inspectorName,
}) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    await logWalkaboutEmail(sql, {
      inspectionId,
      questionId,
      emailTo: 'undeliverable@inspection.local',
      routing: 'estate_walkabout_repair:no_recipients',
      status: 'failed',
    })
    return { sent: 0, failed: [{ error: 'no_recipients' }] }
  }

  const photos = Array.isArray(item.photo_urls) ? item.photo_urls.filter((url) => typeof url === 'string' && url) : []
  const photoLinks = photos.length
    ? `<ul>${photos.map((url) => `<li><a href="${escapeHtml(url)}">Photo</a></li>`).join('')}</ul>`
    : '<p>None supplied.</p>'
  const targetDate = 'TBC'
  const dateInspected = formatDateGb(submittedAt || new Date().toISOString())
  const subject = `Estate Walkabout action: ${locationLine || estateName || inspectionId}`
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
      <h1 style="font-size:18px;margin:0 0 12px">Estate Walkabout action raised</h1>
      <p><strong>Estate name:</strong> ${escapeHtml(estateName || '—')}</p>
      <p><strong>Ward:</strong> —</p>
      <p><strong>Date inspected:</strong> ${escapeHtml(dateInspected)}</p>
      <p><strong>Block/location:</strong> ${escapeHtml(locationLine || '—')}</p>
      <p><strong>Defect/action needed:</strong> ${escapeHtml(item.action_summary || actionTitle || item.description || '—')}</p>
      <p><strong>Works order number:</strong> ${escapeHtml(item.order_raised_number || '—')}</p>
      <p><strong>Target date:</strong> ${escapeHtml(targetDate)}</p>
      <p><strong>Comments:</strong> ${escapeHtml(item.description || '—')}</p>
      <p><strong>Raised by:</strong> ${escapeHtml(inspectorName || '—')}</p>
      <p><strong>Action Plan PDF:</strong> ${actionPlanPdfUrl ? `<a href="${escapeHtml(actionPlanPdfUrl)}">Open action plan</a>` : 'Not available'}</p>
      <p><strong>Photos:</strong></p>
      ${photoLinks}
    </div>
  `
  const text = [
    'Estate Walkabout action raised',
    `Estate name: ${estateName || '—'}`,
    'Ward: —',
    `Date inspected: ${dateInspected}`,
    `Block/location: ${locationLine || '—'}`,
    `Defect/action needed: ${item.action_summary || actionTitle || item.description || '—'}`,
    `Works order number: ${item.order_raised_number || '—'}`,
    `Target date: ${targetDate}`,
    `Comments: ${item.description || '—'}`,
    `Action Plan PDF: ${actionPlanPdfUrl || 'Not available'}`,
    photos.length ? `Photos: ${photos.join('; ')}` : 'Photos: None supplied',
  ].join('\n')

  const sent = []
  const failed = []
  for (const recipient of recipients) {
    const email = String(recipient.email || '').trim()
    if (!email) continue
    try {
      const result = await sendAppEmail({ to: email, subject, html, text })
      if (result.ok) {
        sent.push({ email, person_id: recipient.id })
        await logWalkaboutEmail(sql, {
          inspectionId,
          questionId,
          emailTo: email,
          routing: `estate_walkabout_repair:${recipient.job_title || recipient.role || 'person'}`,
          status: 'sent',
        })
      } else {
        failed.push({ email, error: result.error || 'send_failed' })
        await logWalkaboutEmail(sql, {
          inspectionId,
          questionId,
          emailTo: email,
          routing: `estate_walkabout_repair:${result.error || 'failed'}`,
          status: 'failed',
        })
      }
    } catch (error) {
      failed.push({ email, error: error?.message || String(error) })
      await logWalkaboutEmail(sql, {
        inspectionId,
        questionId,
        emailTo: email,
        routing: `estate_walkabout_repair:${error?.message || 'error'}`,
        status: 'failed',
      })
    }
  }
  return { sent: sent.length, failed }
}

export async function sendEstateWalkaboutRepairActionNotification(sql, {
  inspectionId,
  questionId,
  actionTitle,
  actionPlanPdfUrl = null,
  estateName = '',
  locationLine = '',
  submittedAt = null,
  inspectorName = '',
  description = '',
  actionSummary = '',
  orderRaisedNumber = '',
  photoUrls = [],
  estateId = null,
  responsiblePersonId = null,
  repairsOfficerPersonId = null,
}) {
  const item = {
    description,
    action_summary: actionSummary,
    order_raised_number: orderRaisedNumber,
    photo_urls: Array.isArray(photoUrls) ? photoUrls : [],
  }
  if (!isRepairRelatedWalkaboutAction(item)) return { sent: 0, failed: [] }
  const recipients = await findWalkaboutRepairRecipients(sql, {
    estateId,
    responsiblePersonId,
    repairsOfficerPersonId,
  })
  return sendWalkaboutRepairActionEmail(sql, {
    inspectionId,
    questionId,
    item,
    actionTitle,
    actionPlanPdfUrl,
    recipients,
    estateName,
    locationLine,
    submittedAt,
    inspectorName,
  })
}

export function buildEstateWalkaboutActionDescription({
  inspectionId,
  estateName,
  itemDescription,
  status,
  actionSummary,
  orderRaisedNumber,
  photoUrls,
  submittedByName,
  submittedByEmail,
}) {
  const lines = [
    `Inspection: ${inspectionId}`,
    `Estate / area: ${estateName || '—'}`,
    `Item: ${itemDescription || '—'}`,
    `Status: ${status || '—'}`,
    `Action summary: ${actionSummary || '—'}`,
    `Order raised number: ${orderRaisedNumber || '—'}`,
    `Raised by: ${submittedByName || '—'}${submittedByEmail ? ` (${submittedByEmail})` : ''}`,
  ]
  if (Array.isArray(photoUrls) && photoUrls.length > 0) {
    lines.push(`Photos: ${photoUrls.join('; ')}`)
  }
  return lines.join('\n')
}

/**
 * @param {import('@vercel/postgres').Sql} sql
 * @param {object} opts
 */
export async function createEstateWalkaboutActionsFromPayload(sql, opts) {
  const {
    inspectionId,
    estateName = '',
    template,
    answers = {},
    answer_extras = {},
    inspectorName = '',
    inspectorEmail = '',
    locationLine = '',
    submittedAt = null,
    inspectionTypeLabel = '',
    estateId = null,
    responsiblePersonId = null,
    repairsOfficerPersonId = null,
  } = opts

  if (!inspectionId) return { created: 0, warnings: [] }
  const tpl = template
  if (!isEstateWalkaboutTemplate(tpl) && !isEstateWalkaboutTemplateVersion(tpl)) {
    return { created: 0, warnings: [] }
  }

  const walkaboutRecipientScope = {
    estateId,
    responsiblePersonId: responsiblePersonId || answers.ew_q_responsible || null,
    repairsOfficerPersonId: repairsOfficerPersonId || answers.ew_st_repairs_officer_select || null,
  }

  const raw = answers[ESTATE_WALKABOUT_CHECKLIST_QID]
  const items = safeParseChecklist(raw)
  const warnings = []
  const actions = []
  const emailResults = { sent: 0, failed: [] }
  let repairRecipients = null
  let created = 0

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (!item.action_required) continue
    const itemId = String(item.id || '').trim() || `row_${created}_${Date.now()}`
    const questionId = `ew_chk_${itemId}`.slice(0, 120)
    const description = String(item.description || '').trim()
    const status = String(item.status || '').trim() || '—'
    const actionSummary = String(item.action_summary || '').trim()
    const orderRaisedNumber = String(item.order_raised_number || '').trim()
    const photoUrls = Array.isArray(item.photo_urls)
      ? item.photo_urls.filter((u) => typeof u === 'string' && u.trim())
      : []

    if (!actionSummary) {
      warnings.push(`Skipped action (missing action summary) for item: ${description.slice(0, 60) || itemId}`)
      continue
    }

    const title = `Walkabout — ${description.slice(0, 200) || 'Action'}`
    const body = buildEstateWalkaboutActionDescription({
      inspectionId,
      estateName,
      itemDescription: description,
      status,
      actionSummary,
      orderRaisedNumber,
      photoUrls,
      submittedByName: inspectorName,
      submittedByEmail: inspectorEmail,
    })

    const actionId = `action_${inspectionId}_${questionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    try {
      const existing = await sql`
        SELECT id FROM actions
        WHERE inspection_id = ${inspectionId} AND question_id = ${questionId}
        LIMIT 1
      `
      if (existing.rows.length > 0) continue

      await sql`
        INSERT INTO actions (
          id, inspection_id, section_id, section_name, question_id,
          category, priority, title, description, location, status,
          comment, auto_created, photo_urls
        )
        VALUES (
          ${actionId},
          ${inspectionId},
          'ew_sec_checklist',
          'Checklist & action plan',
          ${questionId},
          'estate_walkabout',
          null,
          ${title},
          ${body},
          null,
          'open',
          ${actionSummary},
          true,
          ${JSON.stringify(photoUrls)}
        )
      `
      created += 1
      console.log('[estate-walkabout-actions] Created checklist action for inspection:', { actionId, inspectionId, questionId })
      let actionPlanPdfUrl = null
      const blockLine = String(locationLine || estateName || '').trim() || estateName || '—'
      const typeLabel =
        String(inspectionTypeLabel || '').trim() ||
        (tpl && (tpl.name || tpl.template_name)) ||
        'Estate walkabout'
      const pdfResult = await tryGenerateAndStoreIssueJobCardPdf(sql, {
        actionId,
        inspectionId,
        inspectionType: typeLabel,
        blockEstate: blockLine,
        location: blockLine,
        exactLocation: blockLine,
        dateRaised: formatDateGb(submittedAt || new Date().toISOString()),
        dateSent: formatDateGb(submittedAt || new Date().toISOString()),
        issueTitle: title,
        issueType: 'Estate walkabout — checklist',
        issueDetail: [
          actionSummary,
          description ? `Item: ${description}` : '',
          `Status (checklist): ${status}`,
          orderRaisedNumber ? `Order raised number: ${orderRaisedNumber}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 2500),
        priority: 'As reported',
        assignedTeam: '—',
        targetCompletionDate: 'TBC',
        jobNumber: 'Pending assignment',
        status: 'Open',
        photoUrls,
      })
      actionPlanPdfUrl = pdfResult?.url || null
      if (actionPlanPdfUrl) {
        try {
          await sql`UPDATE actions SET issue_pdf_url = ${actionPlanPdfUrl} WHERE id = ${actionId}`
        } catch (urlErr) {
          console.warn('[estate-walkabout-actions] could not save issue_pdf_url:', urlErr?.message || urlErr)
        }
      }
      const actionEntry = {
        id: actionId,
        category: 'estate_walkabout',
        title,
        description: actionSummary || description || title,
        comment: actionSummary || null,
        location: locationLine || estateName || null,
        status: 'open',
        photo_urls: photoUrls,
        order_raised_number: orderRaisedNumber || null,
        issue_pdf_url: actionPlanPdfUrl || null,
        created_at: new Date(),
      }
      actions.push(actionEntry)

      if (isRepairRelatedWalkaboutAction(item)) {
        try {
          if (!repairRecipients) {
            repairRecipients = await findWalkaboutRepairRecipients(sql, walkaboutRecipientScope)
          }
          const emailResult = await sendWalkaboutRepairActionEmail(sql, {
            inspectionId,
            questionId,
            item,
            actionTitle: title,
            actionPlanPdfUrl,
            recipients: repairRecipients,
            estateName,
            locationLine,
            submittedAt,
            inspectorName,
          })
          emailResults.sent += emailResult.sent || 0
          if (Array.isArray(emailResult.failed)) emailResults.failed.push(...emailResult.failed)
        } catch (emailErr) {
          console.warn('[estate-walkabout-actions] repair email failed:', emailErr?.message || emailErr)
          emailResults.failed.push({ actionId, error: emailErr?.message || String(emailErr) })
        }
      }
    } catch (e) {
      console.error('[estate-walkabout-actions] insert failed:', e)
      warnings.push(`Could not create action for item ${itemId}: ${e?.message || String(e)}`)
    }
  }

  const itemResult = await createEstateWalkaboutActionsFromInspectionItems(sql, {
    inspectionId,
    templateVersion: tpl,
    answersMap: answers,
    answerExtras: answer_extras,
    estateName,
    inspectorName,
    locationLine,
    submittedAt,
    inspectionTypeLabel,
    estateId: walkaboutRecipientScope.estateId,
    responsiblePersonId: walkaboutRecipientScope.responsiblePersonId,
    repairsOfficerPersonId: walkaboutRecipientScope.repairsOfficerPersonId,
  })

  return {
    created: created + (itemResult.created || 0),
    warnings: [...warnings, ...(itemResult.warnings || [])],
    actions: [...actions, ...(itemResult.actions || [])],
    emailResults,
  }
}

/**
 * Load checklist from inspection_answers rows (submit route).
 * @param {object[]} answersRows
 * @param {Record<string, unknown>} answersMap
 */
export async function createEstateWalkaboutActionsFromInspection(sql, opts) {
  const {
    inspectionId,
    templateVersion,
    answersRows = [],
    answersMap = {},
    estateName = '',
    inspectorName = '',
    inspectorEmail = '',
    locationLine = '',
    submittedAt = null,
    inspectionTypeLabel = '',
    estateId = null,
  } = opts

  if (!isEstateWalkaboutTemplateVersion(templateVersion)) {
    return { created: 0, warnings: [] }
  }

  // Scope walkabout action emails to the officers chosen on this inspection.
  const responsiblePersonId = answersMap.ew_q_responsible || null
  const repairsOfficerPersonId = answersMap.ew_st_repairs_officer_select || null

  const row = answersRows.find((r) => r.question_id === ESTATE_WALKABOUT_CHECKLIST_QID)
  const raw =
    row?.answer_text ??
    row?.answer_value ??
    answersMap[ESTATE_WALKABOUT_CHECKLIST_QID] ??
    ''

  const checklistResult = await createEstateWalkaboutActionsFromPayload(sql, {
    inspectionId,
    estateName,
    template: templateVersion,
    answers: { [ESTATE_WALKABOUT_CHECKLIST_QID]: raw },
    answer_extras: {},
    inspectorName,
    inspectorEmail,
    locationLine,
    submittedAt,
    inspectionTypeLabel: inspectionTypeLabel || templateVersion?.name || '',
    estateId,
    responsiblePersonId,
    repairsOfficerPersonId,
  })

  const itemResult = await createEstateWalkaboutActionsFromInspectionItems(sql, {
    inspectionId,
    templateVersion,
    answersMap,
    answerExtras: {},
    estateName,
    inspectorName,
    locationLine,
    submittedAt,
    inspectionTypeLabel: inspectionTypeLabel || templateVersion?.name || '',
    estateId,
    responsiblePersonId,
    repairsOfficerPersonId,
  })

  return {
    created: (checklistResult.created || 0) + (itemResult.created || 0),
    warnings: [...(checklistResult.warnings || []), ...(itemResult.warnings || [])],
  }
}
