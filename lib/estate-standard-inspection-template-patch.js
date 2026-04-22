/**
 * Estate inspection form only (`isEstateInspectionFormTemplate`).
 *
 * Applies full A–D–NA grading + comment + photo to every applicable checklist question.
 * Does not use slot allowlists or Airtable Question Order as a filter.
 *
 * Not applied to Neighbourhood Voice, walkabout, or non–estate-inspection templates (see
 * `isEstateInspectionFormTemplate`). Caretaker-only templates without an estate-inspection
 * match do not run this patch.
 */
import { isEstateInspectionFormTemplate } from '@/lib/standard-inspection-form'

const DEFAULT_GRADING_OPTIONS = ['A', 'B', 'C', 'D', 'NA']

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

function ensureGradedConditionFlags(q) {
  q.standard_inspection_condition_row = true
  q.caretaker_graded_always_extras = true
  q.nv_graded_require_comment_photo = true
  q.nv_graded_require_comment_only = true
}

function upgradeToGradedCondition(q) {
  q.question_type = 'graded'
  q.answer_mode = 'graded'
  if (!q.grading_options?.length) q.grading_options = [...DEFAULT_GRADING_OPTIONS]
  if (!q.grading_scheme_name) q.grading_scheme_name = 'A–D–NA'
  ensureGradedConditionFlags(q)
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
 * Abandoned vehicles section: AVS removal authorisation line and cost code are data fields only (not A–D–NA).
 * "Authorising officer details…" stays graded when the template marks it as graded.
 */
export function isEstateAbandonedVehiclesNonGradedDataField(q, section) {
  if (!q || !section) return false
  const st = sectionTitleBlob(section)
  if (!st.includes('abandon') || !st.includes('vehicle')) return false
  const b = questionTextBlob(q)
  if (/\bcost\s*code\b/.test(b) || b.includes('costcode') || b.includes('cost_code')) return true
  if (b.includes('officer') && (b.includes('email') || b.includes('phone') || b.includes('detail'))) return false
  if (b.includes('hereby') && b.includes('authori')) return true
  if (b.includes('avs') && (b.includes('removal') || b.includes('vehicle'))) return true
  if (b.includes('removal') && b.includes('following vehicle')) return true
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

/**
 * Rows that are not “checklist condition” lines: keep their Airtable-driven shape (Y/N issue,
 * routing, NV, conditional follow-ups).
 */
function shouldPreserveNonGradedShape(q) {
  if (!q) return true
  if (q.caretaker_routing_bundle || q.nv_render_kind) return true
  if (q.standard_inspection_issue_row) return true
  if (q.depends_on_question_id) return true
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
      if (shouldPreserveNonGradedShape(q) || isEstateAbandonedVehiclesNonGradedDataField(q, sec)) {
        restoreQuestionToAirtableShape(q)
      } else {
        upgradeToGradedCondition(q)
      }
    }
  }

  return template
}
