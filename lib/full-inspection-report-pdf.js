/**
 * Build full inspection report PDF payload from Postgres + template snapshot,
 * generate bytes, upload to Blob, persist inspections.full_pdf_url (on-demand).
 */

import { buildInspectionReportPdf } from '@/lib/pdf/buildInspectionReportPdf'
import { uploadInspectionPdfToBlob } from '@/lib/blob/uploadPdf'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import { applyGroundsMaintenanceTemplateToSnapshot } from '@/lib/grounds-maintenance-template'
import {
  applyNeighbourhoodVoiceTemplatePatch,
  isNeighbourhoodVoiceQuestionRenderable,
} from '@/lib/neighbourhood-voice-template-patch'
import { unpackNvWizardNotes } from '@/lib/nv-notes-pack'

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
    answerByQuestionId[row.question_id] =
      row.answer_value ||
      row.answer_text ||
      (row.answer_boolean != null ? (row.answer_boolean ? 'Yes' : 'No') : row.answer_number) ||
      ''
  }

  const photosByQuestionId = {}
  for (const p of photosResult.rows) {
    if (!p.question_id || !p.blob_url) continue
    if (!photosByQuestionId[p.question_id]) photosByQuestionId[p.question_id] = []
    photosByQuestionId[p.question_id].push({
      url: p.blob_url,
      caption: p.filename || undefined,
      linkedQuestionId: p.question_id,
    })
  }

  const allActionsResult = await sqlFn`
    SELECT question_id FROM actions
    WHERE inspection_id = ${inspectionId} AND status = 'open'
  `
  const openActionQuestionIds = new Set(
    allActionsResult.rows.map((r) => r.question_id).filter(Boolean)
  )

  const sections = Array.isArray(templateVersion?.sections) ? templateVersion.sections : []
  const pdfSections = []
  const pdfPhotos = []

  for (const section of sections) {
    const sectionQuestions = []
    for (const question of section.questions || []) {
      if (question.nv_hidden) continue
      if (!isNeighbourhoodVoiceQuestionRenderable(question)) continue
      const qid = question.id
      const answerVal = answerByQuestionId[qid] ?? ''
      const answerRow = answersResult.rows.find((r) => r.question_id === qid)
      const unpacked = unpackNvWizardNotes(answerRow?.notes)
      const comment =
        (unpacked.structured && typeof unpacked.structured.comment === 'string'
          ? unpacked.structured.comment
          : '') || unpacked.plainComment || ''

      sectionQuestions.push({
        id: qid,
        text: question.resident_wording || question.question_text || question.label || '',
        answer: String(answerVal),
        comment: comment || undefined,
        grade: question.grading_scheme_name ? String(answerVal) : undefined,
        actionCreated: openActionQuestionIds.has(qid),
      })

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

  const pdfData = {
    inspectionId,
    templateName: inspectionRow.template_name || templateVersion?.name || 'Template',
    blockName: estateBlockLine || inspectionRow.title || inspectionRow.location_label || 'Block',
    completedAt: inspectionRow.submitted_at || new Date().toISOString(),
    officerName: inspectionRow.inspector_name || 'Officer',
    sections: pdfSections,
    photos: pdfPhotos,
  }

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

  const existing = String(inspection.full_pdf_url ?? inspection.pdf_url ?? '').trim()
  if (existing && !forceRegenerate) {
    return { ok: true, url: existing, generated: false }
  }

  try {
    const { pdfData } = await buildFullInspectionReportPdfPayload(sqlFn, inspectionId, inspection)
    const fullPdfBytes = await buildInspectionReportPdf(pdfData)
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
