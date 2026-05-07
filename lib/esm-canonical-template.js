import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'

const ESM_SECTION_TITLES = [
  'Internal Cleaning',
  'Lifts',
  'Car Parks',
  'Abandoned Vehicles',
  'Garages',
  'Paths and Hardstandings',
  'Play Areas',
  'External Cleaning',
  'Waste Management',
  'Health and Safety',
  'Signage and Notice Boards',
  'Fire Safety',
  'Grounds Maintenance',
]

function slug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^\s*\d+[\.)-]?\s*/, '')
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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

  const existingSections = Array.isArray(template.sections) ? template.sections : []
  const usedSectionIds = new Set()
  const sections = ESM_SECTION_TITLES.map((title, index) => {
    const order = index + 1
    const titleKey = normalizeTitle(title)
    const existing =
      existingSections.find((section) => !usedSectionIds.has(section?.id) && sectionOrder(section) === order) ||
      existingSections.find((section) => {
        if (!section || usedSectionIds.has(section.id)) return false
        return normalizeTitle(section.title || section.name) === titleKey
      })
    if (existing?.id) usedSectionIds.add(existing.id)
    const numberedTitle = `${order}. ${title}`
    return {
      ...(existing || {}),
      id: existing?.id || `esm_live_section_${order}_${slug(title)}`,
      title: numberedTitle,
      name: numberedTitle,
      sort_order: order,
      section_order: order,
      order,
      help_text: existing?.help_text ?? null,
      what_to_look_for: existing?.what_to_look_for ?? null,
      is_repeatable: existing?.is_repeatable ?? false,
      section_type: existing?.section_type || 'standard',
      questions: sortQuestions(existing?.questions || []),
    }
  })

  return {
    ...template,
    template_type: template.template_type || 'esm_inspection',
    type: template.type || template.template_type || 'esm_inspection',
    sections,
    questions: sections.flatMap((section) => section.questions),
  }
}

export function applyEsmCanonicalTemplates(templates) {
  if (!Array.isArray(templates)) return templates
  return templates.map((template) => replaceWithCanonicalEsmTemplate(template))
}
