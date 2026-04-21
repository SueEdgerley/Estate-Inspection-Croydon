/**
 * Ensures the dedicated Estate inspection form uses graded A–D–NA + comment + photo (Airtable Q4-style).
 * Mutates template snapshots in place; safe to run multiple times.
 * Does not apply to caretaker, NV, walkabout, or other templates — see `isEstateInspectionFormTemplate`.
 */
import { isEstateInspectionFormTemplate } from '@/lib/standard-inspection-form'

const DEFAULT_GRADING_OPTIONS = ['A', 'B', 'C', 'D', 'NA']

function isYesNoType(q) {
  const qt = String(q?.question_type || q?.answer_mode || '').toLowerCase()
  return qt.includes('yes_no') || qt === 'yesno'
}

/** Keep Y/N rows that exist to capture "report an issue" / fire trigger flows. */
function looksLikeIssueReportingYesNo(q) {
  if (!isYesNoType(q)) return false
  const text = String(q.question_text || q.label || '').toLowerCase()
  return (
    /(is there an issue|issue that needs|needs reporting|report an issue|anything to report|reporting for this area)/.test(
      text
    ) ||
    /(identified a|fire safety issue)/.test(text)
  )
}

function shouldPreserveQuestion(q) {
  if (!q) return true
  if (q.caretaker_routing_bundle) return true
  if (q.standard_inspection_issue_row) return true
  if (q.nv_render_kind) return true
  if (looksLikeIssueReportingYesNo(q)) return true
  if (q.is_trigger === true && isYesNoType(q)) return true
  if (q.depends_on_question_id) return true
  return false
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

/**
 * @param {Record<string, unknown>} template
 */
export function applyEstateStandardInspectionGradingPatch(template) {
  if (!template || !isEstateInspectionFormTemplate(template)) return template
  const sections = template.sections
  if (!Array.isArray(sections)) return template

  for (const section of sections) {
    const questions = section.questions
    if (!Array.isArray(questions)) continue
    for (const q of questions) {
      if (q._estate_grading_patch_applied) continue

      if (shouldPreserveQuestion(q)) {
        q._estate_grading_patch_applied = true
        continue
      }

      const rawType = String(q.question_type || '').toLowerCase()
      if (rawType.includes('grad') || rawType === 'graded') {
        ensureGradedConditionFlags(q)
        if (!q.grading_options?.length) q.grading_options = [...DEFAULT_GRADING_OPTIONS]
        q._estate_grading_patch_applied = true
        continue
      }

      upgradeToGradedCondition(q)
      q._estate_grading_patch_applied = true
    }
  }
  return template
}
