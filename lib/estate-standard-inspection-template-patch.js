/**
 * Estate inspection form only (`isEstateInspectionFormTemplate`), including **Estate Inspection Form V2**.
 *
 * Converts each main checklist question to graded A/B/C/D/NA with **Croydon NV Grading – Final**,
 * without attaching the standard-inspection comment+photo bundle (no duplicate blocks).
 *
 * Preserves: routing bundles, NV fields, instructional/header-only rows, and the two Q12
 * Abandoned Vehicles data fields (AVS authorisation text, Cost code).
 *
 * Not applied to Neighbourhood Voice, walkabout, or non–estate-inspection templates.
 */
import { isEstateInspectionFormTemplate } from '@/lib/standard-inspection-form'

const DEFAULT_GRADING_OPTIONS = ['A', 'B', 'C', 'D', 'NA']
const ESTATE_INSPECTION_GRADING_SCHEME = 'Croydon NV Grading – Final'

function normalizeQuestionType(v) {
  if (v == null || v === '') return 'text'
  const raw = String(v).toLowerCase().trim()
  if (raw.includes('yes_no')) return 'yes_no'
  if (/yes\s*[\/\-]?\s*no|yesno|yes\s+no/.test(raw)) return 'yes_no'
  if (raw.includes('yes') && raw.includes('no')) return 'yes_no'
  const s = raw.replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  return s === 'yesno' ? 'yes_no' : s
}

function inferNormalizedQuestionType(q) {
  const rawType = String(q.question_type_raw ?? '').trim()
  const commentWhen = q.comment_required_when
  const photoWhen = q.photo_required_when
  const inferredYesNo =
    (commentWhen === 'on_no' ||
      photoWhen === 'on_no' ||
      commentWhen === 'on_yes' ||
      photoWhen === 'on_yes') &&
    !rawType
  if (rawType) return normalizeQuestionType(rawType)
  if (inferredYesNo) return 'yes_no'
  return normalizeQuestionType(q.question_type || 'text')
}

function clearEstateGradedFlags(q) {
  delete q.standard_inspection_condition_row
  delete q.caretaker_graded_always_extras
  delete q.nv_graded_require_comment_photo
  delete q.nv_graded_require_comment_only
}

function restoreQuestionToAirtableShape(q) {
  clearEstateGradedFlags(q)
  const t = inferNormalizedQuestionType(q)
  q.question_type = t
  q.answer_mode = t
  const low = String(t).toLowerCase()
  if (!low.includes('grad') && low !== 'graded') {
    q.grading_options = null
    q.grading_scheme_name = null
  }
}

/**
 * Main estate checklist line: graded A–D–NA only (no `standard_inspection_condition_row` extras).
 */
function upgradeEstateInspectionQuestionToGraded(q) {
  const preservedPhotoWhen = q.photo_required_when
  const preservedTypePhoto = !!q.type_includes_photo
  const preservedRequirePhotoNo = !!q.require_photo_on_no
  const preservedIncludePhoto = !!q.include_photo
  delete q.standard_inspection_issue_row
  q.question_type = 'graded'
  q.answer_mode = 'graded'
  if (!q.grading_options?.length) q.grading_options = [...DEFAULT_GRADING_OPTIONS]
  q.grading_scheme_name = ESTATE_INSPECTION_GRADING_SCHEME
  clearEstateGradedFlags(q)
  q.comment_required_when = null
  /** Keep Airtable photo intent (checkbox / “Photo required when” / type with photo) for the form UI. */
  if (preservedPhotoWhen === 'always' || preservedPhotoWhen === 'on_no' || preservedPhotoWhen === 'on_yes') {
    q.photo_required_when = preservedPhotoWhen
  } else {
    q.photo_required_when = null
  }
  if (preservedTypePhoto) q.type_includes_photo = true
  else if (preservedRequirePhotoNo) q.type_includes_photo = true
  if (preservedIncludePhoto) q.include_photo = true
}

function questionTextBlob(q) {
  return `${q.resident_wording || ''} ${q.question_text || ''} ${q.label || ''}`.toLowerCase()
}

function sectionTitleBlob(sec) {
  return `${sec?.title || ''} ${sec?.name || ''}`.toLowerCase()
}

/**
 * Abandoned vehicles (Q12) only: AVS vehicle-list authorisation line + Cost code stay non-graded.
 * Any other line in that section (including graded AVS process questions) must use A–D–NA.
 */
export function isEstateAbandonedVehiclesNonGradedDataField(q, section) {
  if (!q || !section) return false
  const st = sectionTitleBlob(section)
  if (!st.includes('abandon') || !st.includes('vehicle')) return false
  const b = questionTextBlob(q)
  if (/\bcost\s*code\b/.test(b) || b.includes('costcode') || b.includes('cost_code')) return true
  if (b.includes('hereby') && b.includes('authori')) return true
  if (
    b.includes('following vehicle') &&
    (b.includes('registration') ||
      b.includes('make') ||
      b.includes('model') ||
      b.includes('colour') ||
      b.includes('color'))
  ) {
    return true
  }
  return false
}

function sortOrderNum(q) {
  const n = Number(q.sort_order ?? q.order)
  return Number.isFinite(n) ? n : 0
}

function sortedSections(sections) {
  return [...(sections || [])].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
}

function sortedQuestions(questions) {
  return [...(questions || [])].sort((a, b) => sortOrderNum(a) - sortOrderNum(b))
}

/** Non-answerable or non-checklist rows from Airtable (instruction, header, empty layout). */
export function isEstateInspectionInstructionalQuestion(q) {
  if (!q) return true
  const raw = String(q.question_type_raw ?? q.question_type ?? q.answer_mode ?? '').toLowerCase()
  if (/instruction|section_header|divider|^info$|^static$|^label$/i.test(raw)) return true
  const prompt = `${q.question_text || ''}${q.label || ''}${q.resident_wording || ''}`.trim()
  if (prompt.length < 2) return true
  return false
}

/**
 * Rows that count as Q1, Q2, Q3… for mirroring / indexing (excludes true blanks; keeps helper-only lines).
 * @param {Record<string, unknown>} q
 * @param {Record<string, unknown>} sec
 */
export function isEstateInspectionChecklistBodyRow(q, sec) {
  if (!q || !sec) return false
  if (q.nv_hidden) return false
  if (q.caretaker_routing_bundle || q.nv_render_kind) return false
  if (isEstateAbandonedVehiclesNonGradedDataField(q, sec)) return false
  const raw = String(q.question_type_raw ?? '').toLowerCase()
  if (/instruction|section_header|divider|^info$|^static$|^label$/i.test(raw)) return false
  if (!isEstateInspectionInstructionalQuestion(q)) return true
  const blob = `${q.instructions || ''}${q.helper_text || ''}${q.resident_wording || ''}${q.question_text || ''}${q.label || ''}`.trim()
  return blob.length >= 3
}

/**
 * Keep Airtable shape only for bundled routing / NV, layout-only rows, and explicit exclusions
 * (Abandoned Vehicles AVS + Cost code). All other rows — including Y/N “issue” lines and
 * conditional follow-ups — become graded.
 *
 * Checklist body rows (including “instruction” layout where the wording lives in `instructions`
 * but `question_text` is empty) must still upgrade; otherwise Q3-style rows never become graded.
 */
function shouldPreserveNonGradedShape(q, sec) {
  if (!q) return true
  if (q.caretaker_routing_bundle || q.nv_render_kind) return true
  if (sec && isEstateInspectionChecklistBodyRow(q, sec)) return false
  if (isEstateInspectionInstructionalQuestion(q)) return true
  return false
}

/**
 * @param {Record<string, unknown>} template
 */
/**
 * Numbered checklist rows per section (Q1, Q2, Q3…): skips instructions, routing, NV, Q12 AV data fields.
 * Index resets in each section so “Q3” is the third body row in that section, not the third globally.
 * @param {Record<string, unknown>} template
 * @returns {Map<string, number>} question id → 0-based index within its section (Q1 = 0, Q2 = 1, Q3 = 2)
 */
export function buildEstateInspectionChecklistQuestionIndexMap(template) {
  const m = new Map()
  if (!template || !isEstateInspectionFormTemplate(template)) return m
  const sections = template.sections
  if (!Array.isArray(sections)) return m
  for (const sec of sortedSections(sections)) {
    let i = 0
    for (const q of sortedQuestions(sec.questions)) {
      if (!isEstateInspectionChecklistBodyRow(q, sec)) continue
      m.set(q.id, i++)
    }
  }
  return m
}

function flatQuestionSectionId(q) {
  if (!q || typeof q !== 'object') return null
  const a = q.section_id ?? q.sectionId
  if (a != null && String(a).trim() !== '') return String(a).trim()
  const link = q.Section ?? q.section
  if (Array.isArray(link) && link.length) return String(link[0]).trim()
  if (link != null && typeof link !== 'object') return String(link).trim()
  return null
}

function applyEstateRowGradingDecision(q, sec) {
  const avDataOnly = isEstateAbandonedVehiclesNonGradedDataField(q, sec)
  if (shouldPreserveNonGradedShape(q, sec) || avDataOnly) {
    restoreQuestionToAirtableShape(q)
    if (avDataOnly) {
      q.comment_required_when = null
      q.photo_required_when = null
    }
  } else {
    upgradeEstateInspectionQuestionToGraded(q)
  }
}

export function applyEstateStandardInspectionGradingPatch(template) {
  if (!template || !isEstateInspectionFormTemplate(template)) return template
  const sections = template.sections
  if (!Array.isArray(sections)) return template

  for (const sec of sortedSections(sections)) {
    for (const q of sortedQuestions(sec.questions)) {
      applyEstateRowGradingDecision(q, sec)
    }
  }

  /** Some payloads keep the same rows on `template.questions[]` only; nested `sections[].questions` can be empty. */
  const flat = template.questions
  if (Array.isArray(flat) && flat.length) {
    const secs = sortedSections(sections)
    const secById = new Map(secs.map((s) => [String(s.id), s]))
    const fallbackSec = secs[0] || null
    for (const q of flat) {
      const sid = flatQuestionSectionId(q)
      const sec = (sid && secById.get(String(sid))) || fallbackSec
      if (!sec) continue
      applyEstateRowGradingDecision(q, sec)
    }
  }

  return template
}
