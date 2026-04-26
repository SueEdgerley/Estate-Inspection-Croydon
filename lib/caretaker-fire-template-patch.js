import { isCaretakerTemplate } from '@/lib/caretaker-template'
import {
  isEstateInspectionFormTemplate,
  isEstateInspectionFormV2Template,
} from '@/lib/standard-inspection-form'
import { applyEstateStandardInspectionGradingPatch } from '@/lib/estate-standard-inspection-template-patch'
import { applyEstateInspectionV2TemplatePatch } from '@/lib/estate-inspection-v2-template-patch'

const FIRE_GUIDANCE =
  'If you identify a fire safety issue, select Yes and add details below. This will create an action and send it to the relevant team.'

function isFireSafetySection(section) {
  if (!section) return false
  const t = String(section.section_type || section.type || '').toLowerCase()
  if (t === 'fire_safety' || t === 'fire') return true
  const n = String(section.name || section.title || '').toLowerCase()
  return n.includes('fire') && (n.includes('safety') || n.includes('fire safety'))
}

const TRIGGER_KEYWORDS = ['issue', 'concern', 'problem', 'incident', 'report', 'trigger']

function isYesNoQuestion(q) {
  const qt = String(q?.question_type || q?.answer_mode || '').toLowerCase()
  return qt.includes('yes_no') || qt === 'yesno'
}

function looksLikeIssueTrigger(q) {
  const text = String(q.label || q.question_text || '').toLowerCase()
  return q.is_trigger === true || TRIGGER_KEYWORDS.some((w) => text.includes(w))
}

/**
 * Single fire-safety Y/N row: Yes = issue (comment, photo, recipient, action on submit/save).
 * Mutates `q` in place. Idempotent via `_fire_safety_issue_question_patched`.
 */
function applyFireSafetyYesTriggerPatch(q) {
  if (!q || q._fire_safety_issue_question_patched) return
  q.question_text = 'Have you identified a fire safety issue?'
  q.label = 'Have you identified a fire safety issue?'
  q.action_trigger_on = 'yes'
  q.issue_triggers_on = 'yes'
  q.create_action_on_no = false
  q.require_comment_on_no = false
  q.require_photo_on_no = false
  if (q.create_action_on_yes === undefined) q.create_action_on_yes = true
  q.is_trigger = true
  if (!q.action_category) q.action_category = 'fire_safety'
  q._fire_safety_issue_question_patched = true
}

/**
 * In-memory display patches for **staff inspection templates** loaded from Airtable (mutates `template` in place).
 *
 * - **Caretaker** templates: fire-safety section wording + Yes-trigger issue row where applicable (`patchCaretakerTemplateForFireSafety`).
 * - Legacy **Estate inspection** template (not caretaker, not NV, not walkabout): canonical graded A–D–NA (`applyEstateStandardInspectionGradingPatch`).
 * - **Estate Inspection v2** is left in the Airtable shape exactly as authored (sections, question types, ordering).
 *
 * Other templates are unchanged except running the no-op caretaker fire pass (returns immediately when not caretaker).
 */
export function applyTemplateDisplayPatches(template) {
  if (!template) return template
  patchCaretakerTemplateForFireSafety(template)
  if (isEstateInspectionFormV2Template(template)) {
    applyEstateInspectionV2TemplatePatch(template)
    return template
  }
  if (isEstateInspectionFormTemplate(template) && !isEstateInspectionFormV2Template(template)) {
    applyEstateStandardInspectionGradingPatch(template)
  }
  return template
}

/** @deprecated Use {@link applyTemplateDisplayPatches} — name kept for older imports; estate inspection uses the same entry point. */
export const applyCaretakerTemplateDisplayPatches = applyTemplateDisplayPatches

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

    const ynQuestions = questions.filter(isYesNoQuestion)
    if (ynQuestions.length === 0) continue

    /** Prefer the first Y/N that already looks like an issue trigger; otherwise the first Y/N in the section. */
    const target = ynQuestions.find(looksLikeIssueTrigger) || ynQuestions[0]
    applyFireSafetyYesTriggerPatch(target)
  }
  return template
}

/**
 * Apply {@link applyTemplateDisplayPatches} to every template in an API list (caretaker fire + estate inspection grading where applicable).
 */
export function patchCaretakerTemplatesList(templates) {
  if (!Array.isArray(templates)) return templates
  for (const t of templates) {
    applyTemplateDisplayPatches(t)
  }
  return templates
}
