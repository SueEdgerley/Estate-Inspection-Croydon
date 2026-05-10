import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'
import { normalizeYesNoAnswer } from '@/lib/issue-trigger-answer'
import { parseCaretakerAnswerNotes } from '@/lib/caretaker-answer-extras'

const ESM_YES_TRIGGER_VALUES = new Set(['yes', 'on_yes', 'true', '1', 'y'])

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

function normalizePhotoUrls(urls) {
  return [...new Set((Array.isArray(urls) ? urls : []).filter((url) => typeof url === 'string' && url.trim()))].sort()
}

function collectEsmIdCardPhotoUrls(extras) {
  const structured = extras?.structured && typeof extras.structured === 'object' ? extras.structured : extras
  return Array.isArray(structured?.id_card_photo_urls)
    ? structured.id_card_photo_urls.filter((url) => typeof url === 'string' && url.trim())
    : []
}

function normalizeEsmYesAnswer(answer) {
  if (normalizeYesNoAnswer(answer) === 'yes') return true
  const value = normalizeTriggerValue(answer)
  return ESM_YES_TRIGGER_VALUES.has(value)
}

function normalizeTriggerValue(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (value == null) return ''
  return String(value).trim().toLowerCase()
}

export function isEsmQuestionActionConfigured(question) {
  if (!question) return false
  const flagValues = [
    question.triggers_action,
    question.action_trigger,
    question.create_action,
    question.create_action_on_yes,
    question.esm_create_action,
    question.esm_action_trigger,
  ]
  if (flagValues.some((value) => value === true)) return true
  if (flagValues.some((value) => ESM_YES_TRIGGER_VALUES.has(normalizeTriggerValue(value)))) return true

  const triggerOnValues = [
    question.action_trigger_on,
    question.issue_triggers_on,
    question.action_trigger_answer,
    question.action_trigger_value,
    question.create_action_on,
    question.action_trigger_when,
    question.action_trigger_on_answer,
  ]
  if (triggerOnValues.some((value) => ESM_YES_TRIGGER_VALUES.has(normalizeTriggerValue(value)))) return true

  const issueAnswers = [
    question.triggers_issue_answer,
    question.triggers_issue_answers,
    question.issue_trigger_answers,
  ]
  return issueAnswers.some((value) => {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[,;|]+/)
    return values.some((part) => ESM_YES_TRIGGER_VALUES.has(normalizeTriggerValue(part)))
  })
}

function getEsmActionCategory(question) {
  if (question?.action_category || question?.category) {
    return question.action_category || question.category
  }
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

function esmLog(event, details) {
  console.log(`[esm-action-plan-actions] ${event}`, details)
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

async function getAvailableActionColumns(sql) {
  try {
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'actions'
        AND column_name IN ('block_id', 'cost_code')
    `
    return new Set((result.rows || []).map((row) => row.column_name))
  } catch (error) {
    console.warn('[esm-action-plan-actions] action column lookup failed:', error?.message || error)
    return new Set()
  }
}

async function insertEsmAction(sql, {
  actionId,
  inspectionId,
  sectionId,
  sectionName,
  questionId,
  category,
  priority,
  title,
  description,
  locationLine,
  comment,
  recipient,
  photoUrlsJson,
  blockId,
  costCode,
  availableActionColumns,
}) {
  const columns = [
    'id',
    'inspection_id',
    'section_id',
    'section_name',
    'question_id',
    'category',
    'priority',
    'title',
    'description',
    'location',
    'status',
    'comment',
    'recipient_person_id',
    'auto_created',
    'photo_urls',
  ]
  const values = [
    actionId,
    inspectionId,
    sectionId || null,
    sectionName,
    questionId,
    category,
    priority,
    title,
    description,
    locationLine || null,
    'open',
    comment || null,
    recipient,
    true,
    photoUrlsJson,
  ]

  if (availableActionColumns.has('block_id')) {
    columns.push('block_id')
    values.push(blockId)
  }
  if (availableActionColumns.has('cost_code')) {
    columns.push('cost_code')
    values.push(costCode)
  }

  const placeholders = values.map((_, idx) => {
    const cast = columns[idx] === 'photo_urls' ? '::jsonb' : ''
    return `$${idx + 1}${cast}`
  })

  await sql.query(
    `INSERT INTO actions (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  )
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
  const findings = []
  const availableActionColumns = await getAvailableActionColumns(sql)
  let created = 0

  for (const section of template.sections || []) {
    const sectionName = section.title || section.name || 'ESM inspection'
    for (const question of section.questions || []) {
      if (!question?.id) continue
      if (question.esm_hidden || question.nv_hidden) continue
      const answer = answers[question.id]

      const extras = answerExtras[question.id] || {}
      const comment = getEsmComment(question, answers, extras)
      const photoUrls = normalizePhotoUrls([
        ...(Array.isArray(dbPhotosByQuestionId[question.id]) ? dbPhotosByQuestionId[question.id] : []),
        ...collectPhotoUrlsFromExtras(extras),
        ...collectEsmIdCardPhotoUrls(extras),
      ])

      const category = safeActionText(getEsmActionCategory(question), 'esm', 50)
      const questionId = safeActionText(question.id, 'esm_question', 255)
      const photoUrlsJson = JSON.stringify(photoUrls)
      const isYesFinding = normalizeEsmYesAnswer(answer)
      const actionConfigured = isEsmQuestionActionConfigured(question)

      esmLog('ESM response processed', {
        inspectionId,
        questionId,
        sectionName,
        answer,
        normalizedYes: isYesFinding,
      })

      if (!isYesFinding) {
        esmLog('action skipped', {
          inspectionId,
          questionId,
          reason: 'answer_not_yes',
        })
        continue
      }

      const questionText = question.question_text || question.label || question.id
      const finding = {
        inspectionId,
        questionId,
        sectionName,
        questionText,
        answer: 'Yes',
        comment: comment || null,
        photo_urls: photoUrls,
        category,
      }
      findings.push(finding)
      esmLog('Yes finding recorded', finding)
      esmLog('action trigger checked', {
        inspectionId,
        questionId,
        triggers_action: question.triggers_action ?? null,
        action_trigger: question.action_trigger ?? null,
        create_action_on_yes: question.create_action_on_yes ?? null,
        action_trigger_on: question.action_trigger_on ?? null,
        issue_triggers_on: question.issue_triggers_on ?? null,
        triggers_issue_answer: question.triggers_issue_answer ?? question.triggers_issue_answers ?? question.issue_trigger_answers ?? null,
        actionConfigured,
      })

      if (!actionConfigured) {
        esmLog('action skipped', {
          inspectionId,
          questionId,
          reason: 'question_not_configured_for_action',
        })
        continue
      }

      try {
        const existing = await sql`
          SELECT id FROM actions
          WHERE inspection_id = ${inspectionId}
            AND question_id = ${questionId}
            AND COALESCE(auto_created, false) = true
          LIMIT 1
        `
        if (existing.rows.length > 0) {
          esmLog('action skipped', {
            inspectionId,
            questionId,
            reason: 'duplicate_auto_action_exists',
            existingActionId: existing.rows[0]?.id || null,
          })
          continue
        }

        const actionId = `action_${inspectionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const recipient = getEsmActionRecipient(extras)
        const emailRouting = getEsmActionEmailRouting(question, extras)
        const priority = question.action_priority || question.priority || null
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

        await insertEsmAction(sql, {
          actionId,
          inspectionId,
          sectionId: section.id,
          sectionName,
          questionId,
          category,
          priority,
          title,
          description,
          locationLine,
          comment,
          recipient,
          photoUrlsJson,
          blockId,
          costCode,
          availableActionColumns,
        })

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
          priority,
          created_at: new Date(),
        })
        esmLog('action created', {
          inspectionId,
          questionId,
          actionId,
          category,
          priority,
          recipient,
        })
      } catch (error) {
        console.error('[esm-action-plan-actions] insert failed:', error)
        warnings.push(`Could not create ESM action for ${question.id}: ${error?.message || String(error)}`)
      }
    }
  }

  return { created, warnings, actions, findings }
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
    return { created: 0, warnings: [], actions: [], findings: [] }
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
