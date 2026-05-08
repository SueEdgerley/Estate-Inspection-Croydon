import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'
import { normalizeYesNoAnswer } from '@/lib/issue-trigger-answer'
import { parseCaretakerAnswerNotes } from '@/lib/caretaker-answer-extras'

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
  const structured = extras?.structured && typeof extras.structured === 'object' ? extras.structured : extras
  return Array.isArray(structured?.id_card_photo_urls)
    ? structured.id_card_photo_urls.filter((url) => typeof url === 'string' && url.trim())
    : []
}

function isEsmActionTrigger(question, answer, extras = {}, photoUrls = []) {
  if (!question || !question.esm_behavior) return false
  const isYes = normalizeYesNoAnswer(answer) === 'yes'
  const comment = typeof extras.comment === 'string' && extras.comment.trim()
  const hasPhotos = Array.isArray(photoUrls) && photoUrls.length > 0
  if (question.esm_q4_abandoned_vehicle === true) return isYes
  if (question.esm_recipient_on_yes === true) return isYes
  if (question.esm_email_on_yes) return isYes
  if (question.esm_email_on_comment_or_issue) return Boolean(comment || isYes)
  if (question.esm_email_on_photo_to_selected_recipient === true) return hasPhotos && Boolean(extras.recipient_person_id)
  if (question.esm_email_on_photo_and_comment) return hasPhotos && Boolean(comment)
  if (question.esm_email_on_photo) return hasPhotos
  return false
}

function getEsmActionCategory(question) {
  const role = String(question?.esm_behavior || '').trim()
  if (!role) return 'esm_photo_comment_issue'
  if (role.includes('health_safety')) return 'health_safety'
  if (role.includes('fire_safety')) return 'fire_safety'
  if (role.includes('abandoned_vehicle')) return 'parking_abandoned_vehicle'
  if (role.includes('graffiti')) return 'graffiti'
  if (role.includes('garage')) return 'garages'
  if (role.includes('tree') || role.includes('ivy')) return 'grounds_maintenance'
  if (role.includes('external_cleaning')) return 'cleaning'
  return `esm_${role}`.slice(0, 50)
}

function getEsmComment(question, answers = {}, extras = {}) {
  const extrasComment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
  if (extrasComment) return extrasComment
  const answerComment = answers && typeof answers[`${question.id}_comment`] === 'string'
    ? answers[`${question.id}_comment`].trim()
    : ''
  return answerComment
}

function getEsmActionRecipient(extras = {}) {
  const selected = typeof extras.recipient_person_id === 'string' ? extras.recipient_person_id.trim() : ''
  if (selected && !selected.includes('@')) return selected
  return null
}

function getEsmActionEmailRouting(question, extras = {}) {
  if (question.esm_email_on_yes) return String(question.esm_email_on_yes)
  if (question.esm_email_on_comment_or_issue) return String(question.esm_email_on_comment_or_issue)
  if (question.esm_email_on_photo_and_comment) return String(question.esm_email_on_photo_and_comment)
  if (question.esm_email_on_photo) return String(question.esm_email_on_photo)
  if (question.esm_email_on_photo_to_selected_recipient && extras.recipient_person_id) return String(extras.recipient_person_id)
  return String(question.email_routing || '').trim()
}

function safeActionText(value, fallback, maxLength) {
  const text = String(value || fallback || '').trim()
  const safe = text || String(fallback || 'ESM action')
  return maxLength && safe.length > maxLength ? safe.slice(0, maxLength) : safe
}

function buildEsmActionDescription({ inspectionId, submittedAt, locationLine, sectionName, questionText, answer, comment, photoUrls, emailRouting, recipient, category, inspectorName }) {
  return [
    inspectionId ? `Inspection ID: ${inspectionId}` : null,
    submittedAt ? `Date/time: ${submittedAt}` : null,
    locationLine ? `Estate / block: ${locationLine}` : null,
    sectionName ? `Section: ${sectionName}` : null,
    questionText ? `Question: ${questionText}` : null,
    answer !== undefined && answer !== null && String(answer).trim() ? `Answer: ${String(answer).trim()}` : null,
    comment ? `Comment: ${comment}` : null,
    photoUrls.length ? `Photo reference(s): ${photoUrls.join('; ')}` : null,
    emailRouting ? `Email/routing: ${emailRouting}` : null,
    recipient ? `Recipient: ${recipient}` : null,
    category ? `Action category: ${category}` : null,
    inspectorName ? `Submitted by: ${inspectorName}` : null,
  ].filter(Boolean).join('\n')
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
    if (!photos[questionId].includes(url)) photos[questionId].push(url)
  }
  return photos
}

async function createEsmActions(sql, opts) {
  const {
    inspectionId,
    template,
    answers = {},
    answerExtras = {},
    dbPhotosByQuestionId = {},
    inspectorName = '',
    locationLine = '',
    submittedAt = null,
    blockId = null,
  } = opts

  if (!inspectionId || !isEsmInspectionFormTemplate(template)) return { created: 0, warnings: [], actions: [] }

  const warnings = []
  const actions = []
  let created = 0

  for (const section of template.sections || []) {
    const sectionName = section.title || section.name || 'ESM inspection'
    for (const question of section.questions || []) {
      if (!question?.id) continue
      if (question.esm_hidden || question.nv_hidden) continue
      const answer = answers[question.id]

      const extras = answerExtras[question.id] || {}
      const comment = getEsmComment(question, answers, extras)
      const photoUrls = [
        ...new Set([
          ...(Array.isArray(dbPhotosByQuestionId[question.id]) ? dbPhotosByQuestionId[question.id] : []),
          ...collectPhotoUrlsFromExtras(extras),
          ...collectEsmIdCardPhotoUrls(extras),
        ]),
      ]

      const hasPhotoOrComment = Boolean(comment || photoUrls.length)
      const explicitActionTrigger = isEsmActionTrigger(question, answer, extras, photoUrls)
      if (!explicitActionTrigger && !hasPhotoOrComment) continue

      const category = safeActionText(getEsmActionCategory(question), 'esm', 50)
      const questionId = safeActionText(question.id, 'esm_question', 255)

      try {
        const existing = await sql`
          SELECT id FROM actions
          WHERE inspection_id = ${inspectionId}
            AND question_id = ${questionId}
            AND category = ${category}
            AND COALESCE(auto_created, false) = true
          LIMIT 1
        `
        if (existing.rows.length > 0) continue

        const questionText = question.question_text || question.label || question.id
        const actionId = `action_${inspectionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const recipient = getEsmActionRecipient(extras)
        const emailRouting = getEsmActionEmailRouting(question, extras)
        const title = safeActionText(`${sectionName} - ${questionText}`, questionText, 500)
        const description = buildEsmActionDescription({
          inspectionId,
          submittedAt,
          locationLine,
          sectionName,
          questionText,
          answer,
          comment,
          photoUrls,
          emailRouting,
          recipient,
          category,
          inspectorName,
        })
        const costCode = question.esm_q4_abandoned_vehicle && extras.cost_code && String(extras.cost_code).trim()
          ? String(extras.cost_code).trim()
          : null

        await sql`
          INSERT INTO actions (
            id, inspection_id, section_id, section_name, question_id,
            category, priority, title, description, location, status,
            comment, recipient_person_id, auto_created, photo_urls,
            block_id, cost_code
          )
          VALUES (
            ${actionId}, ${inspectionId}, ${section.id || null}, ${sectionName}, ${questionId},
            ${category}, null, ${title}, ${description}, ${locationLine || null}, 'open',
            ${comment || null}, ${recipient}, true, ${JSON.stringify(photoUrls)},
            ${blockId}, ${costCode}
          )
        `

        created += 1
        actions.push({
          id: actionId,
          category,
          title,
          description,
          comment: comment || null,
          location: locationLine || null,
          status: 'open',
          photo_urls: photoUrls,
          created_at: new Date(),
        })
      } catch (error) {
        console.error('[esm-action-plan-actions] insert failed:', error)
        warnings.push(`Could not create ESM action for ${question.id}: ${error?.message || String(error)}`)
      }
    }
  }

  return { created, warnings, actions }
}

export async function createEsmActionsFromPayload(sql, opts) {
  return createEsmActions(sql, opts)
}

export async function createEsmActionsFromInspection(sql, opts) {
  const {
    inspectionId,
    templateVersion,
    answersRows = [],
    answersMap = {},
    inspectorName = '',
    locationLine = '',
    submittedAt = null,
    blockId = null,
  } = opts

  if (!inspectionId || !isEsmInspectionFormTemplate(templateVersion)) {
    return { created: 0, warnings: [], actions: [] }
  }

  const answerExtras = {}
  for (const row of answersRows || []) {
    if (!row?.question_id) continue
    answerExtras[row.question_id] = parseCaretakerAnswerNotes(row.notes)
  }

  const dbPhotosByQuestionId = await collectInspectionPhotosByQuestionId(sql, inspectionId)

  return createEsmActions(sql, {
    inspectionId,
    template: templateVersion,
    answers: answersMap,
    answerExtras,
    dbPhotosByQuestionId,
    inspectorName,
    locationLine,
    submittedAt,
    blockId,
  })
}
