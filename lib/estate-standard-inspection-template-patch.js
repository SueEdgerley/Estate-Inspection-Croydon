/**
 * Estate inspection form only (`isEstateInspectionFormTemplate`).
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
  delete q.standard_inspection_issue_row
  q.question_type = 'graded'
  q.answer_mode = 'graded'
  if (!q.grading_options?.length) q.grading_options = [...DEFAULT_GRADING_OPTIONS]
  q.grading_scheme_name = ESTATE_INSPECTION_GRADING_SCHEME
  clearEstateGradedFlags(q)
  q.comment_required_when = null
  q.photo_required_when = null
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
 * Keep Airtable shape only for bundled routing / NV, layout-only rows, and explicit exclusions
 * (Abandoned Vehicles AVS + Cost code). All other rows — including Y/N “issue” lines and
 * conditional follow-ups — become graded.
 */
function shouldPreserveNonGradedShape(q) {
  if (!q) return true
  if (q.caretaker_routing_bundle || q.nv_render_kind) return true
  if (isEstateInspectionInstructionalQuestion(q)) return true
  return false
}

/**
 * @param {Record<string, unknown>} template
 */
export function applyEstateStandardInspectionGradingPatch(template) {
  if (!template || !isEstateInspectionFormTemplate(template)) return template
  const sections = template.sections
  if (!Array.isArray(sections)) return template

  for (const sec of sortedSections(sections)) {
    for (const q of sortedQuestions(sec.questions)) {
      const avDataOnly = isEstateAbandonedVehiclesNonGradedDataField(q, sec)
      if (shouldPreserveNonGradedShape(q) || avDataOnly) {
        restoreQuestionToAirtableShape(q)
        if (avDataOnly) {
          q.comment_required_when = null
          q.photo_required_when = null
        }
      } else {
        upgradeEstateInspectionQuestionToGraded(q)
      }
    }
  }

  /** Third row in Airtable order (Q3): same graded + photo affordance as Q2 — re-grade if it stayed non-graded (e.g. layout-only misclassification). */
  const flat = []
  for (const sec of sortedSections(sections)) {
    for (const q of sortedQuestions(sec.questions)) {
      flat.push({ q, sec })
    }
  }
  if (flat.length >= 3) {
    const { q, sec } = flat[2]
    const rawLayout = String(q.question_type_raw ?? q.question_type ?? '').toLowerCase()
    const isExplicitLayoutRow = /instruction|section_header|divider|^info$|^static$|^label$/i.test(rawLayout)
    if (
      !q.caretaker_routing_bundle &&
      !q.nv_render_kind &&
      !isEstateAbandonedVehiclesNonGradedDataField(q, sec) &&
      !isExplicitLayoutRow
    ) {
      upgradeEstateInspectionQuestionToGraded(q)
    }
  }

  return template
}
