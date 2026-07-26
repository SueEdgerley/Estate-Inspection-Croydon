/**
 * Build full inspection report PDF payload from Postgres + template snapshot,
 * generate bytes, upload to Blob, persist inspections.full_pdf_url (on-demand).
 */

import { buildInspectionReportPdf } from '@/lib/pdf/buildInspectionReportPdf'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import { inspectionIsCaretaker } from '@/lib/caretaker-template'
import {
  caretakerSectionInScope,
  resolveCaretakerInspectionScope,
} from '@/lib/caretaker-specific-task-inspection'
import { applyGroundsMaintenanceTemplateToSnapshot } from '@/lib/grounds-maintenance-template'
import {
  applyNeighbourhoodVoiceTemplatePatch,
  isNeighbourhoodVoiceQuestionRenderable,
} from '@/lib/neighbourhood-voice-template-patch'
import { unpackNvWizardNotes } from '@/lib/nv-notes-pack'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'
import {
  categoryLabel,
  cleanActionDisplayText,
  displayActionStatus,
} from '@/lib/action-display-formatter'
import { parseActionPhotoUrls } from '@/lib/action-photos'
import { isPdfReportableIssue } from '@/lib/pdf/inspection-report-issue-filter'
import {
  REPORT_VARIANTS,
  resolveInspectionReportVariant,
  resolvePdfResultMode,
} from '@/lib/pdf/inspection-report-variant'

import { ESTATE_WALKABOUT_CHECKLIST_QID } from '@/lib/estate-walkabout-template'
import {
  looksLikePersonId,
  questionStoresPersonId,
  resolvePersonDisplayNames,
} from '@/lib/resolve-person-display-name'
import {
  buildWalkaboutChecklistPdfRows,
  isWalkaboutChecklistQuestionId,
  looksLikeWalkaboutChecklistJson,
  parseWalkaboutChecklistAnswer,
} from '@/lib/pdf/walkabout-checklist-pdf'

function answerValueFromRow(row) {
  if (!row) return ''
  if (row.answer_value != null && String(row.answer_value).trim() !== '') return String(row.answer_value)
  if (row.answer_text != null && String(row.answer_text).trim() !== '') return String(row.answer_text)
  if (row.answer_boolean != null) return row.answer_boolean ? 'Yes' : 'No'
  if (row.answer_number != null) return String(row.answer_number)
  return ''
}

function questionLabel(question, fallback) {
  return String(
    question?.resident_wording ||
      question?.question_text ||
      question?.label ||
      question?.text ||
      fallback ||
      ''
  ).trim()
}

function extractUsefulDescription(row) {
  const comment = cleanActionDisplayText(row.comment)
  if (comment) return comment

  const cleaned = cleanActionDisplayText(row.description, { preserveLabels: true })
  if (!cleaned) return ''

  const keptLines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      const label = line.match(/^([^:]+):/)?.[1]?.trim().toLowerCase() || ''
      if (
        [
          'inspection id',
          'date/time',
          'section',
          'question',
          'answer',
          'photo reference',
          'photo reference(s)',
          'photo references',
          'email/routing',
          'recipient',
          'action category',
          'submitted by',
          'estate / block',
          'estate/block',
        ].includes(label)
      ) {
        return false
      }
      if (label === 'comment') return true
      return !label
    })
    .map((line) => line.replace(/^Comment:\s*/i, '').trim())
    .filter(Boolean)

  return keptLines.join('\n').trim()
}

function buildPdfAction(row, questionMetaById, inspectionRow, locationLine, answerByQuestionId, personDisplayById) {
  const questionMeta = questionMetaById.get(row.question_id)
  const questionText = questionLabel(questionMeta?.question, '')
  const sectionTitle = String(questionMeta?.sectionTitle || '').trim()
  const title =
    cleanActionDisplayText(row.title) ||
    (sectionTitle && questionText ? `${sectionTitle} – ${questionText}` : '') ||
    questionText ||
    categoryLabel(row.category) ||
    'Issue'
  const description = extractUsefulDescription(row)
  const photoUrls = parseActionPhotoUrls(row.photo_urls)
  const category = categoryLabel(row.category) || ''
  const priority = categoryLabel(row.priority) || displayActionStatus(row.priority, '') || ''
  const rawRaisedBy = cleanActionDisplayText(inspectionRow.inspector_name) || ''
  const raisedBy =
    (personDisplayById && looksLikePersonId(rawRaisedBy)
      ? personDisplayById.get(rawRaisedBy)
      : null) || rawRaisedBy
  return {
    title,
    category,
    description: description || '',
    priority: priority && priority !== 'Open' ? priority : '',
    location: cleanActionDisplayText(row.location) || locationLine || '',
    status: displayActionStatus(row.status, 'Open'),
    raisedBy,
    photoUrls,
    photoCount: photoUrls.length,
    questionId: row.question_id || null,
    isReportableIssue: isPdfReportableIssue(row, answerByQuestionId),
  }
}

/**
 * @param {import('@vercel/postgres').Sql} sqlFn
 * @param {string} inspectionId
 * @param {Record<string, unknown>} inspectionRow
 */
export async function buildFullInspectionReportPdfPayload(sqlFn, inspectionId, inspectionRow) {
  const answersResult = await sqlFn`
    SELECT * FROM inspection_answers
    WHERE inspection_id = ${inspectionId}
    ORDER BY section_id, question_id
  `

  const photosResult = await sqlFn`
    SELECT question_id, blob_url, filename
    FROM inspection_photos
    WHERE inspection_id = ${inspectionId}
  `

  const locRow = await sqlFn`
    SELECT COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS location_line
    FROM inspections i
    LEFT JOIN estates e ON e.id = i.estate_id
    LEFT JOIN blocks b ON b.id = i.block_id
    WHERE i.id = ${inspectionId}
    LIMIT 1
  `
  const estateBlockLine = String(locRow.rows[0]?.location_line || inspectionRow.location_label || inspectionRow.title || '').trim()

  let templateVersion = inspectionRow.template_version
  if (typeof templateVersion === 'string') {
    try {
      templateVersion = JSON.parse(templateVersion)
    } catch {
      templateVersion = null
    }
  }
  if (templateVersion && typeof templateVersion === 'object') {
    applyGroundsMaintenanceTemplateToSnapshot(templateVersion)
    applyNeighbourhoodVoiceTemplatePatch(templateVersion)
    applyTemplateDisplayPatches(templateVersion)
  }

  const answerByQuestionId = {}
  for (const row of answersResult.rows) {
    answerByQuestionId[row.question_id] = answerValueFromRow(row)
  }

  const photosByQuestionId = {}
  const addPhotoToQuestion = (questionId, photo) => {
    if (!questionId || !photo?.url) return
    const url = String(photo.url).trim()
    if (!url) return
    if (!photosByQuestionId[questionId]) photosByQuestionId[questionId] = []
    if (photosByQuestionId[questionId].some((existing) => existing.url === url)) return
    photosByQuestionId[questionId].push({
      url,
      caption: photo.caption || undefined,
      linkedQuestionId: questionId,
    })
  }

  for (const p of photosResult.rows) {
    if (!p.question_id || !p.blob_url) continue
    // Walkabout checklist photos are all tagged under one QID; attribution belongs
    // on each action's photo_urls (Issues Raised). Skipping here avoids hiding
    // per-action photos via usedPhotoUrls dedupe in the PDF builder.
    if (String(p.question_id) === ESTATE_WALKABOUT_CHECKLIST_QID) continue
    addPhotoToQuestion(p.question_id, {
      url: p.blob_url,
      caption: p.filename || undefined,
    })
  }

  for (const row of answersResult.rows) {
    const notesInfo = unpackNvWizardNotes(row.notes)
    const notePhotoUrls = Array.isArray(notesInfo.structured.photo_urls)
      ? notesInfo.structured.photo_urls.filter(Boolean)
      : []
    const paperFormPhotoUrls = Array.isArray(notesInfo.structured.paper_form_photo_urls)
      ? notesInfo.structured.paper_form_photo_urls.filter(Boolean)
      : []
    const allNotePhotoUrls = [...notePhotoUrls, ...paperFormPhotoUrls]
    if (row.question_id && allNotePhotoUrls.length > 0) {
      for (const url of allNotePhotoUrls) {
        addPhotoToQuestion(row.question_id, {
          url,
          caption: 'Photo from answer notes',
        })
      }
    }
  }

  const allActionsResult = await sqlFn`
    SELECT question_id, category, auto_created
    FROM actions
    WHERE inspection_id = ${inspectionId}
  `
  const actionRows = await sqlFn`
    SELECT id, title, description, comment, location, category, status, priority,
           question_id, photo_urls, created_at, auto_created
    FROM actions
    WHERE inspection_id = ${inspectionId}
    ORDER BY created_at ASC
  `

  const sections = Array.isArray(templateVersion?.sections) ? templateVersion.sections : []
  const caretakerScope = inspectionIsCaretaker(inspectionRow)
    ? resolveCaretakerInspectionScope(inspectionRow)
    : null
  const pdfSections = []
  const pdfPhotos = []
  const includedQuestionIds = new Set()
  const questionMetaById = new Map()

  for (const section of sections) {
    for (const question of section.questions || []) {
      if (!question?.id) continue
      questionMetaById.set(question.id, {
        question,
        sectionTitle: section.title || section.name || 'Section',
      })
    }
  }

  // Resolve people.id answers (e.g. Responsible person) to display names once for the payload.
  const personIdsToResolve = new Set()
  for (const [qid, rawAnswer] of Object.entries(answerByQuestionId)) {
    const meta = questionMetaById.get(qid)
    const answer = String(rawAnswer ?? '').trim()
    if (!answer) continue
    if (questionStoresPersonId(meta?.question) || looksLikePersonId(answer)) {
      personIdsToResolve.add(answer)
    }
  }
  if (looksLikePersonId(inspectionRow.inspector_name)) {
    personIdsToResolve.add(String(inspectionRow.inspector_name).trim())
  }
  if (looksLikePersonId(inspectionRow.inspector_id)) {
    personIdsToResolve.add(String(inspectionRow.inspector_id).trim())
  }
  const personDisplayById = await resolvePersonDisplayNames(sqlFn, personIdsToResolve)

  const displayAnswerValue = (qid, rawAnswer) => {
    const answer = String(rawAnswer ?? '').trim()
    if (!answer) return ''
    const meta = questionMetaById.get(qid)
    if (questionStoresPersonId(meta?.question) || looksLikePersonId(answer)) {
      return personDisplayById.get(answer) || answer
    }
    return answer
  }

  const reportVariant = resolveInspectionReportVariant(inspectionRow, templateVersion)
  const isWalkaboutReport = reportVariant === REPORT_VARIANTS.WALKABOUT
  const responsibleOfficerName = displayAnswerValue(
    'ew_q_responsible',
    answerByQuestionId.ew_q_responsible || ''
  )

  const actionPhotoUrlsByQuestionId = new Map()
  for (const row of actionRows.rows || []) {
    const qid = String(row.question_id || '').trim()
    if (!qid) continue
    const urls = parseActionPhotoUrls(row.photo_urls)
    if (!urls.length) continue
    const existing = actionPhotoUrlsByQuestionId.get(qid) || []
    actionPhotoUrlsByQuestionId.set(qid, [...new Set([...existing, ...urls])])
  }

  const openActions = (actionRows.rows || [])
    .map((row) =>
      buildPdfAction(
        row,
        questionMetaById,
        inspectionRow,
        estateBlockLine,
        answerByQuestionId,
        personDisplayById
      )
    )
    .filter((action) => action.isReportableIssue)

  const reportableIssueQuestionIds = new Set(
    openActions.map((action) => action.questionId).filter(Boolean)
  )
  // Keep photo-linked questions in findings even when the linked action is photo-evidence only
  const anyActionQuestionIds = new Set(
    (allActionsResult.rows || []).map((r) => r.question_id).filter(Boolean)
  )

  for (const section of sections) {
    if (caretakerScope && !caretakerSectionInScope(section, caretakerScope)) continue
    const sectionQuestions = []
    for (const question of section.questions || []) {
      if (question.nv_hidden) continue
      if (!isNeighbourhoodVoiceQuestionRenderable(question)) continue
      const qid = question.id
      const rawAnswerForQ = answerByQuestionId[qid] ?? ''

      // Walkabout: expand structured checklist into one findings row per item (with photos).
      // Match by known QID or by checklist-shaped JSON (never print raw JSON).
      const shouldExpandChecklist =
        isWalkaboutReport &&
        (isWalkaboutChecklistQuestionId(qid) || looksLikeWalkaboutChecklistJson(rawAnswerForQ))
      if (shouldExpandChecklist) {
        const items = parseWalkaboutChecklistAnswer(rawAnswerForQ)
        const expanded = buildWalkaboutChecklistPdfRows(items, {
          responsibleOfficerName,
          actionPhotoUrlsByQuestionId,
        })
        for (const row of expanded.questions) {
          sectionQuestions.push(row)
          includedQuestionIds.add(row.id)
        }
        for (const photo of expanded.photos) {
          addPhotoToQuestion(photo.questionId, { url: photo.url })
          const list = photosByQuestionId[photo.questionId] || []
          const last = list[list.length - 1]
          if (last) pdfPhotos.push(last)
        }
        includedQuestionIds.add(qid)
        continue
      }

      const answerVal = displayAnswerValue(qid, rawAnswerForQ)
      const answerRow = answersResult.rows.find((r) => r.question_id === qid)
      if (!answerVal && !answerRow && !photosByQuestionId[qid]?.length && !anyActionQuestionIds.has(qid)) continue
      const unpacked = unpackNvWizardNotes(answerRow?.notes)
      const comment =
        (unpacked.structured && typeof unpacked.structured.comment === 'string'
          ? unpacked.structured.comment
          : '') || unpacked.plainComment || ''
      const gradeValue = question.grading_scheme_name
        ? String(answerByQuestionId[qid] ?? '')
        : undefined
      const resultMode = resolvePdfResultMode(
        question,
        answerByQuestionId[qid] ?? '',
        reportVariant
      )

      sectionQuestions.push({
        id: qid,
        text: questionLabel(question, qid),
        answer: String(answerVal),
        rating: gradeValue || (String(answerVal).trim() ? String(answerVal) : undefined),
        comment: comment || undefined,
        grade: gradeValue,
        resultMode,
        hasIssue: reportableIssueQuestionIds.has(qid),
      })
      includedQuestionIds.add(qid)
      const questionPhotos = photosByQuestionId[qid] || []
      for (const qp of questionPhotos) pdfPhotos.push(qp)
    }
    if (sectionQuestions.length > 0) {
      pdfSections.push({
        title: section.title || section.name || 'Section',
        questions: sectionQuestions,
      })
    }
  }

  // Walkabout fallback: expand any unanswered checklist JSON still sitting in answers
  // (e.g. QID not present in template sections snapshot).
  if (isWalkaboutReport) {
    for (const row of answersResult.rows || []) {
      const qid = row.question_id
      if (!qid || includedQuestionIds.has(qid)) continue
      const rawAnswerVal = answerValueFromRow(row)
      if (!isWalkaboutChecklistQuestionId(qid) && !looksLikeWalkaboutChecklistJson(rawAnswerVal)) {
        continue
      }
      const items = parseWalkaboutChecklistAnswer(rawAnswerVal)
      const expanded = buildWalkaboutChecklistPdfRows(items, {
        responsibleOfficerName,
        actionPhotoUrlsByQuestionId,
      })
      if (!expanded.questions.length) {
        includedQuestionIds.add(qid)
        continue
      }
      const sectionTitle = 'Additional inspection items'
      const sectionQuestions = []
      for (const q of expanded.questions) {
        sectionQuestions.push(q)
        includedQuestionIds.add(q.id)
      }
      for (const photo of expanded.photos) {
        addPhotoToQuestion(photo.questionId, { url: photo.url })
        const list = photosByQuestionId[photo.questionId] || []
        const last = list[list.length - 1]
        if (last) pdfPhotos.push(last)
      }
      includedQuestionIds.add(qid)
      pdfSections.push({ title: sectionTitle, questions: sectionQuestions })
    }
  }

  const fallbackBySection = new Map()
  for (const row of answersResult.rows || []) {
    const qid = row.question_id
    if (!qid || includedQuestionIds.has(qid)) continue
    if (isWalkaboutChecklistQuestionId(qid) || looksLikeWalkaboutChecklistJson(answerValueFromRow(row))) {
      continue
    }
    const rawAnswerVal = answerValueFromRow(row)
    const answerVal = displayAnswerValue(qid, rawAnswerVal)
    const unpacked = unpackNvWizardNotes(row.notes)
    const comment =
      (unpacked.structured && typeof unpacked.structured.comment === 'string'
        ? unpacked.structured.comment
        : '') || unpacked.plainComment || ''
    const hasPhotos = (photosByQuestionId[qid] || []).length > 0
    const hasAction = anyActionQuestionIds.has(qid)
    if (!answerVal && !comment && !hasPhotos && !hasAction) continue

    const meta = questionMetaById.get(qid)
    const sectionTitle = String(meta?.sectionTitle || row.section_id || 'Saved answers')
    if (!fallbackBySection.has(sectionTitle)) fallbackBySection.set(sectionTitle, [])
    const gradeValue =
      meta?.question?.grading_scheme_name || String(row.question_type || '').toLowerCase() === 'graded'
        ? String(rawAnswerVal)
        : undefined
    fallbackBySection.get(sectionTitle).push({
      id: qid,
      text: questionLabel(meta?.question, qid),
      answer: String(answerVal),
      rating: gradeValue || (String(answerVal).trim() ? String(answerVal) : undefined),
      comment: comment || undefined,
      grade: gradeValue,
      resultMode: resolvePdfResultMode(meta?.question, rawAnswerVal, reportVariant),
      hasIssue: reportableIssueQuestionIds.has(qid),
    })
    includedQuestionIds.add(qid)
    const questionPhotos = photosByQuestionId[qid] || []
    for (const qp of questionPhotos) pdfPhotos.push(qp)
  }

  for (const [title, questions] of fallbackBySection.entries()) {
    if (questions.length > 0) {
      pdfSections.push({
        title,
        questions,
      })
    }
  }

  const resolvedOfficerName = (() => {
    const fromName = String(inspectionRow.inspector_name || '').trim()
    if (fromName && looksLikePersonId(fromName)) {
      return personDisplayById.get(fromName) || fromName
    }
    if (fromName) return fromName
    const fromId = String(inspectionRow.inspector_id || '').trim()
    if (fromId && looksLikePersonId(fromId)) {
      return personDisplayById.get(fromId) || fromId
    }
    return fromName || 'Officer'
  })()

  const pdfData = {
    inspectionId,
    reportVariant,
    templateName: inspectionRow.template_name || templateVersion?.name || inspectionRow.type || 'Inspection form',
    blockName: estateBlockLine || inspectionRow.title || inspectionRow.location_label || 'Block',
    completedAt: inspectionRow.submitted_at || new Date().toISOString(),
    officerName: resolvedOfficerName,
    inspectionScopeLabel: caretakerScope?.scopeLabel || undefined,
    sections: pdfSections,
    photos: pdfPhotos,
    actions: openActions,
  }
  const totalAnswers = answersResult.rows.length
  const answersWithComments = answersResult.rows.reduce((sum, row) => {
    const unpacked = unpackNvWizardNotes(row.notes)
    const comment =
      (unpacked.structured && typeof unpacked.structured.comment === 'string'
        ? unpacked.structured.comment
        : '') || unpacked.plainComment || ''
    return sum + (comment.trim() ? 1 : 0)
  }, 0)
  const answersWithPhotos = answersResult.rows.reduce((sum, row) => {
    if (!row.question_id) return sum
    return sum + ((photosByQuestionId[row.question_id] || []).length > 0 ? 1 : 0)
  }, 0)
  const payloadQuestionCount = pdfSections.reduce((sum, section) => sum + (section.questions?.length || 0), 0)
  const payloadCommentCount = pdfSections.reduce(
    (sum, section) =>
      sum + (section.questions?.filter((q) => q.comment && String(q.comment).trim()).length || 0),
    0
  )
  const payloadPhotoCount = pdfPhotos.length
  console.log(
    '[PDF payload] inspectionId=%s totalAnswers=%d answersWithComments=%d answersWithPhotos=%d payloadQuestionCount=%d payloadCommentCount=%d payloadPhotoCount=%d',
    inspectionId,
    totalAnswers,
    answersWithComments,
    answersWithPhotos,
    payloadQuestionCount,
    payloadCommentCount,
    payloadPhotoCount
  )

  return { pdfData, estateBlockLine }
}

/**
 * Return existing Blob URL or generate, upload, and save.
 * @param {import('@vercel/postgres').Sql} sqlFn
 * @param {{ inspectionId: string, forceRegenerate?: boolean }} opts
 */
export async function ensureFullInspectionPdf(sqlFn, opts) {
  const { inspectionId, forceRegenerate = false } = opts
  const inspRes = await sqlFn`SELECT * FROM inspections WHERE id = ${inspectionId} LIMIT 1`
  const inspection = inspRes.rows[0]
  if (!inspection) {
    return { ok: false, error: 'not_found', url: null, generated: false }
  }
  if (!inspection.submitted_at && String(inspection.status || '').toLowerCase() !== 'submitted') {
    return { ok: false, error: 'PDF is available after submission.', url: null, generated: false }
  }

  const existing = getInspectionFullReportPdfUrl(inspection)
  if (existing && !forceRegenerate) {
    console.log('[PDF] Inspection %s already has full_pdf_url; skipping regeneration', inspectionId)
    return { ok: true, url: existing, generated: false }
  }

  try {
    const { pdfData } = await buildFullInspectionReportPdfPayload(sqlFn, inspectionId, inspection)
    const fullPdfBytes = await buildInspectionReportPdf(pdfData)
    const { uploadInspectionPdfToBlob } = await import('@/lib/blob/uploadPdf')
    const fullPdfUrl = await uploadInspectionPdfToBlob({
      inspectionId,
      pdfBytes: fullPdfBytes,
      kind: 'report',
    })

    await sqlFn`
      UPDATE inspections
      SET pdf_url = ${fullPdfUrl},
          full_pdf_url = ${fullPdfUrl},
          pdf_generation_error = NULL
      WHERE id = ${inspectionId}
    `

    return { ok: true, url: fullPdfUrl, generated: true }
  } catch (e) {
    const msg = e?.message || String(e)
    const truncated = msg.length > 2000 ? msg.slice(0, 2000) : msg
    try {
      await sqlFn`
        UPDATE inspections
        SET pdf_generation_error = ${truncated}
        WHERE id = ${inspectionId}
      `
    } catch {
      // ignore
    }
    return { ok: false, error: msg, url: null, generated: false }
  }
}
