/**
 * Rules for which Airtable rows are "main" graded checklist lines vs supporting/admin fields
 * on the Estate Inspection form only (used by `applyEstateStandardInspectionGradingPatch`).
 *
 * Main graded: default for checklist items.
 * Supporting: admin/detail follow-ups (not forced to A–D–NA).
 */

const NV_GRADING_TITLE_RE = /\s*[\(\[]?\s*Croydon\s+NV\s+Grading[^\)\]]*[\)\]]?\s*/gi

/**
 * Remove NV grading scheme titles mistakenly embedded in question copy (Airtable / linked schemes).
 * @param {Record<string, unknown>} q
 */
export function stripNvGradingWordingFromQuestionCopy(q) {
  if (!q) return
  const strip = (s) =>
    String(s ?? '')
      .replace(NV_GRADING_TITLE_RE, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+\)/g, ')')
      .trim()
  if (q.question_text != null) q.question_text = strip(q.question_text)
  if (q.label != null) q.label = strip(q.label)
}

/**
 * Supporting / admin fields: must stay text, select, etc. — not A–D–NA blocks.
 * Heuristic: wording + type (Abandoned Vehicles block, cost codes, officer fields, confirmations).
 * @param {Record<string, unknown>} q
 */
export function isEstateSupportingDetailQuestion(q) {
  if (!q) return false
  const text = String(q.question_text || q.label || '')
    .toLowerCase()
    .trim()
  const key = String(q.question_key || '').toLowerCase()

  if (
    /\b(cost code|vehicle details|officer details|authoris(?:e|ing)? officer|authorizing officer)\b/.test(text)
  ) {
    return true
  }
  if (/^location$|^confirm details/.test(text) || /\bconfirm details are complete\b/.test(text)) {
    return true
  }
  if (/(cost|vehicle|officer|location|confirm)(_|-|\s)/.test(key) && /(_code|detail|officer|vehicle|confirm)/.test(key)) {
    return true
  }

  const rawType = String(q.question_type_raw || q.question_type || '').toLowerCase()
  if (
    (rawType.includes('single_select') || rawType.includes('select')) &&
    /\b(cost|repairs|grounds|parking|general)\b/.test(text) &&
    (/^—\s*select|^select\b|dropdown/i.test(text) || text.includes('cost'))
  ) {
    return true
  }

  return false
}

/**
 * Y/N rows used for issue reporting / triggers — keep yes_no (not converted to graded).
 * @param {Record<string, unknown>} q
 */
export function isEstateIssueOrTriggerYesNo(q) {
  const qt = String(q.question_type || q.answer_mode || q.question_type_raw || '').toLowerCase()
  if (!qt.includes('yes_no') && qt !== 'yesno') return false
  const t = String(q.question_text || q.label || '').toLowerCase()
  if (q.is_trigger === true) return true
  if (q.standard_inspection_issue_row) return true
  if (/(issue|report|identified|concern).*(abandon|vehicle|fire|safety)/.test(t)) return true
  if (/abandon.*vehicle.*(issue|report)/.test(t)) return true
  return false
}
