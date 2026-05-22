import { isCaretakerTemplate } from '@/lib/caretaker-template'
import {
  isEstateInspectionFormTemplate,
  isEstateInspectionFormV2Template,
} from '@/lib/standard-inspection-form'
import { applyEstateStandardInspectionGradingPatch } from '@/lib/estate-standard-inspection-template-patch'
import { applyEstateInspectionV2TemplatePatch } from '@/lib/estate-inspection-v2-template-patch'
import { applyEsmInspectionFormPatch, isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'

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

function getCaretakerSectionNumber(section) {
  const raw = String(section?.title || section?.name || '').trim()
  const match = raw.match(/^(\d+)\s*[.)-]?/)
  return match ? Number(match[1]) : null
}

function getCaretakerQuestionPart(question, index) {
  const key = String(question?.question_key || '')
  const match = key.match(/_q(\d+)$/i)
  const oneBased = match ? Number(match[1]) : index + 1
  return Number.isFinite(oneBased) && oneBased > 0 ? oneBased : index + 1
}

function patchCaretakerQuestionLabels(template) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  for (const section of sections) {
    const sectionNo = getCaretakerSectionNumber(section)
    const questions = Array.isArray(section.questions) ? section.questions : []
    questions.forEach((q, index) => {
      if (!q) return
      if (sectionNo === 1) {
        q.caretaker_photo_always = true
        q.caretaker_comment_on_photo = true
        q.caretaker_simple_photo_capture = true
      } else if (sectionNo === 2) {
        q.caretaker_simple_photo_capture = true
        if (getCaretakerQuestionPart(q, index) === 4) {
          q.question_text = 'Bins and recycling'
          q.label = 'Bins and recycling'
        }
      } else if (sectionNo >= 3 && sectionNo <= 7) {
        q.caretaker_photo_always = false
        q.caretaker_simple_photo_capture = false
        q.caretaker_comment_on_yes = true
        q.caretaker_photo_on_yes = true
      }
    })
  }
}

function setNumberedTitle(section, number, title) {
  if (!section) return
  section.title = `${number}. ${title}`
  section.name = `${number}. ${title}`
  section.sort_order = number
  section.section_order = number
  section.order = number
}

function configurePestControlQuestion(q) {
  if (!q) return q
  q.question_text = 'Is there a pest control problem?'
  q.label = 'Is there a pest control problem?'
  q.question_type = 'yes_no'
  q.answer_mode = 'yes_no'
  q.action_trigger_on = 'yes'
  q.issue_triggers_on = 'yes'
  q.create_action_on_yes = true
  q.create_action_on_no = false
  q.require_comment_on_no = false
  q.require_photo_on_no = false
  q.caretaker_comment_on_yes = true
  q.caretaker_photo_on_yes = true
  q.caretaker_photo_always = false
  q.caretaker_recipient_on_yes = true
  q.caretaker_recipient_always = false
  q.caretaker_recipient_options = null
  q.esm_use_people_recipients = true
  q.action_category = q.action_category || 'pest_control'
  q.category = q.category || 'pest_control'
  return q
}

function isPestControlQuestion(q) {
  const text = String(q?.label || q?.question_text || q?.question_key || '').toLowerCase()
  return text.includes('pest control')
}

function patchCaretakerSectionStructure(template) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  if (!sections.length) return

  let pestQuestion = null
  for (const section of sections) {
    if (getCaretakerSectionNumber(section) !== 2) continue
    const questions = Array.isArray(section.questions) ? section.questions : []
    section.questions = questions.filter((q) => {
      if (!isPestControlQuestion(q)) return true
      pestQuestion = pestQuestion || q
      return false
    })
  }

  const existingPestSection = sections.find((section) => {
    if (getCaretakerSectionNumber(section) === 3) {
      const title = String(section.title || section.name || '').toLowerCase()
      if (title.includes('pest control')) return true
    }
    return (Array.isArray(section.questions) ? section.questions : []).some(isPestControlQuestion)
  })

  if (existingPestSection) {
    const questions = Array.isArray(existingPestSection.questions) ? existingPestSection.questions : []
    const existingQuestion = questions.find(isPestControlQuestion) || questions[0] || pestQuestion
    existingPestSection.questions = [configurePestControlQuestion(existingQuestion || { id: 'cm_pest_control_q1', question_key: 'pest_control_q1' })]
    setNumberedTitle(existingPestSection, 3, 'Pest Control')
  } else {
    sections.splice(2, 0, {
      id: 'cm_pest_control_section',
      title: '3. Pest Control',
      name: '3. Pest Control',
      sort_order: 3,
      section_type: 'standard',
      is_repeatable: false,
      questions: [
        configurePestControlQuestion(
          pestQuestion || {
            id: 'cm_pest_control_q1',
            question_key: 'pest_control_q1',
          }
        ),
      ],
    })
  }

  const semanticTitles = [
    { matcher: /asb/i, number: 4, title: 'ASB' },
    { matcher: /health\s+and\s+safety/i, number: 5, title: 'Health and Safety' },
    { matcher: /fire\s+safety|fire/i, number: 6, title: 'Fire Safety' },
    { matcher: /repair/i, number: 7, title: 'Any repairs to report?' },
  ]
  for (const section of sections) {
    const title = String(section.title || section.name || '')
    const match = semanticTitles.find((item) => item.matcher.test(title))
    if (match) setNumberedTitle(section, match.number, match.title)
  }

  sections.sort((a, b) => {
    const an = getCaretakerSectionNumber(a) ?? Number(a?.sort_order ?? 0)
    const bn = getCaretakerSectionNumber(b) ?? Number(b?.sort_order ?? 0)
    return an - bn
  })
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
  q.comment_required_when = 'on_yes'
  q.caretaker_recipient_on_yes = true
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
  if (isCaretakerTemplate(template)) {
    return patchCaretakerTemplateForFireSafety(template)
  }
  if (isEsmInspectionFormTemplate(template)) {
    applyEsmInspectionFormPatch(template)
    return template
  }
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
  patchCaretakerSectionStructure(template)
  patchCaretakerQuestionLabels(template)

  for (const section of sections) {
    if (!isFireSafetySection(section)) continue
    if (!section._fire_safety_patch_applied) {
      section.title = '6. Fire Safety'
      section.name = '6. Fire Safety'
      section.sort_order = 6
      section.help_text = null
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
