/**
 * Estate inspection form only.
 *
 * **Only** these on-form slots receive full A–D–NA grading plus Comment + photo (`upgradeToGradedCondition`):
 * 3, 7, 11, 14, 18, 22, 24, 25, 28, 29, 30.
 * Routing bundle / NV rows are skipped and do not consume a slot number.
 *
 * **Numbering:** 1 = first applicable question, 2 = second, etc. (section/question order via
 * `sort_order` for sequencing only; Airtable Question Order is not used as the slot label.)
 *
 * Every other slot: no estate graded extras (see `restoreQuestionToAirtableShape`).
 *
 * Other templates: unaffected — `isEstateInspectionFormTemplate`.
 */
import { isEstateInspectionFormTemplate } from '@/lib/standard-inspection-form'

const DEFAULT_GRADING_OPTIONS = ['A', 'B', 'C', 'D', 'NA']

/** Sole allowlist: `upgradeToGradedCondition` runs only when `slot` is in this set. */
const ESTATE_GRADING_PHOTO_INDICES = new Set([3, 7, 11, 14, 18, 22, 24, 25, 28, 29, 30])

function normalizeQuestionType(v) {
  if (v == null || v === '') return 'text'
  const raw = String(v).toLowerCase().trim()
  if (raw.includes('yes_no')) return 'yes_no'
  if (/yes\s*[\/\-]?\s*no|yesno|yes\s+no/.test(raw)) return 'yes_no'
  if (raw.includes('yes') && raw.includes('no')) return 'yes_no'
  const s = raw.replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  return s === 'yesno' ? 'yes_no' : s
}

/** Restore base `question_type` from stored raw + yes/no hints (not Airtable order). */
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

function shouldSkipEntirely(q) {
  return !!(q && (q.caretaker_routing_bundle || q.nv_render_kind))
}

/**
 * @param {Record<string, unknown>} template
 */
export function applyEstateStandardInspectionGradingPatch(template) {
  if (!template || !isEstateInspectionFormTemplate(template)) return template
  const sections = template.sections
  if (!Array.isArray(sections)) return template

  const flat = []
  for (const sec of sortedSections(sections)) {
    for (const q of sortedQuestions(sec.questions)) {
      flat.push(q)
    }
  }

  let slot = 0
  for (let i = 0; i < flat.length; i++) {
    const q = flat[i]
    if (shouldSkipEntirely(q)) continue

    slot += 1

    if (ESTATE_GRADING_PHOTO_INDICES.has(slot)) {
      upgradeToGradedCondition(q)
    } else {
      restoreQuestionToAirtableShape(q)
    }
  }

  return template
}
