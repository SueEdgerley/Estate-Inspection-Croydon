import { isEsmInspectionFormTemplate } from './esm-inspection-form.js'

function sectionOrder(section) {
  const n = Number(section?.section_order ?? section?.sort_order ?? section?.order ?? 0)
  return Number.isFinite(n) && n > 0 ? n : null
}

function questionOrder(question, fallback) {
  const n = Number(question?.question_order ?? question?.sort_order ?? question?.order ?? 0)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function sortQuestions(questions) {
  return [...(questions || [])].sort(
    (a, b) => questionOrder(a, 0) - questionOrder(b, 0) || String(a?.id || '').localeCompare(String(b?.id || ''))
  )
}

export function replaceWithCanonicalEsmTemplate(template) {
  if (!template || !isEsmInspectionFormTemplate(template)) return template

  const sections = Array.isArray(template.sections)
    ? [...template.sections]
        .sort((a, b) => (sectionOrder(a) ?? 0) - (sectionOrder(b) ?? 0))
        .map((section) => ({
          ...section,
          questions: sortQuestions(section.questions || []),
        }))
    : []

  return {
    ...template,
    template_type: template.template_type || 'esm_inspection',
    type: template.type || template.template_type || 'esm_inspection',
    sections,
    questions: Array.isArray(template.questions) ? template.questions : sections.flatMap((section) => section.questions),
  }
}

export function applyEsmCanonicalTemplates(templates) {
  if (!Array.isArray(templates)) return templates
  return templates.map((template) => replaceWithCanonicalEsmTemplate(template))
}
