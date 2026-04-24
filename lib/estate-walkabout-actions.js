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
  tryGenerateAndStoreIssueJobCardPdf,
  formatDateGb,
} from '@/lib/issue-job-card-upload'

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

export function buildEstateWalkaboutActionDescription({
  inspectionId,
  estateName,
  itemDescription,
  status,
  actionSummary,
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
  } = opts

  if (!inspectionId) return { created: 0, warnings: [] }
  const tpl = template
  if (!isEstateWalkaboutTemplate(tpl) && !isEstateWalkaboutTemplateVersion(tpl)) {
    return { created: 0, warnings: [] }
  }

  const raw = answers[ESTATE_WALKABOUT_CHECKLIST_QID]
  const items = safeParseChecklist(raw)
  const warnings = []
  let created = 0

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (!item.action_required) continue
    const itemId = String(item.id || '').trim() || `row_${created}_${Date.now()}`
    const questionId = `ew_chk_${itemId}`.slice(0, 120)
    const description = String(item.description || '').trim()
    const status = String(item.status || '').trim() || '—'
    const actionSummary = String(item.action_summary || '').trim()
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
      photoUrls,
      submittedByName: inspectorName,
      submittedByEmail: inspectorEmail,
    })

    const actionId = `action_${inspectionId}_${questionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    try {
      const existing = await sql`
        SELECT id FROM actions
        WHERE inspection_id = ${inspectionId} AND question_id = ${questionId} AND status = 'open'
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
      const blockLine = String(locationLine || estateName || '').trim() || estateName || '—'
      const typeLabel =
        String(inspectionTypeLabel || '').trim() ||
        (tpl && (tpl.name || tpl.template_name)) ||
        'Estate walkabout'
      await tryGenerateAndStoreIssueJobCardPdf(sql, {
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
        issueDetail: [actionSummary, description ? `Item: ${description}` : '', `Status (checklist): ${status}`]
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
    } catch (e) {
      console.error('[estate-walkabout-actions] insert failed:', e)
      warnings.push(`Could not create action for item ${itemId}: ${e?.message || String(e)}`)
    }
  }

  return { created, warnings }
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
  } = opts

  if (!isEstateWalkaboutTemplateVersion(templateVersion)) {
    return { created: 0, warnings: [] }
  }

  const row = answersRows.find((r) => r.question_id === ESTATE_WALKABOUT_CHECKLIST_QID)
  const raw =
    row?.answer_text ??
    row?.answer_value ??
    answersMap[ESTATE_WALKABOUT_CHECKLIST_QID] ??
    ''

  return createEstateWalkaboutActionsFromPayload(sql, {
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
  })
}
