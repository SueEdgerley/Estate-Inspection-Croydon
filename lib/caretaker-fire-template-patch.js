import { isCaretakerTemplate } from '@/lib/caretaker-template'

const FIRE_GUIDANCE =
  'If you identify a fire safety issue, select Yes and add details below. This will create an action and send it to the relevant team.'

function isFireSafetySection(section) {
  if (!section) return false
  const t = String(section.section_type || section.type || '').toLowerCase()
  if (t === 'fire_safety' || t === 'fire') return true
  const n = String(section.name || section.title || '').toLowerCase()
  return n.includes('fire') && (n.includes('safety') || n.includes('fire safety'))
}

/**
 * Mutates template snapshot sections in-place: fire safety wording + explicit Yes-trigger for issue questions.
 * Idempotent for repeated calls.
 */
export function patchCaretakerTemplateForFireSafety(template) {
  if (!template || !isCaretakerTemplate(template)) return template
  const sections = template.sections
  if (!Array.isArray(sections)) return template

  for (const section of sections) {
    if (!isFireSafetySection(section)) continue
    if (!section._fire_safety_patch_applied) {
      section.title = 'Fire safety issues'
      section.name = 'Fire safety issues'
      section.help_text = FIRE_GUIDANCE
      section.section_type = section.section_type || 'fire_safety'
      section._fire_safety_patch_applied = true
    }
    const questions = section.questions
    if (!Array.isArray(questions)) continue

    for (const q of questions) {
      const qt = String(q.question_type || q.answer_mode || '').toLowerCase()
      const isYn = qt.includes('yes_no') || qt === 'yesno'
      if (!isYn) continue
      const text = String(q.label || q.question_text || '').toLowerCase()
      const looksLikeIssueTrigger =
        q.is_trigger === true ||
        ['issue', 'concern', 'problem', 'incident', 'report', 'trigger'].some((w) => text.includes(w))
      if (!looksLikeIssueTrigger) continue
      if (!q._fire_safety_issue_question_patched) {
        q.question_text = 'Have you identified a fire safety issue?'
        q.label = 'Have you identified a fire safety issue?'
        q.action_trigger_on = 'yes'
        q.create_action_on_no = false
        q.require_comment_on_no = false
        q.require_photo_on_no = false
        q.create_action_on_yes = q.create_action_on_yes !== false
        q._fire_safety_issue_question_patched = true
      }
    }
  }
  return template
}

/**
 * Apply patch to a list of templates (API response).
 */
export function patchCaretakerTemplatesList(templates) {
  if (!Array.isArray(templates)) return templates
  for (const t of templates) {
    patchCaretakerTemplateForFireSafety(t)
  }
  return templates
}
