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

function questionSectionId(question) {
  const direct = question?.section_id ?? question?.sectionId
  if (direct != null && String(direct).trim() !== '') return String(direct).trim()
  const linked =
    question?.Section ??
    question?.section ??
    question?.['Template Section'] ??
    question?.template_section ??
    question?.['Template Sections'] ??
    question?.template_sections
  if (Array.isArray(linked) && linked.length > 0) return String(linked[0]).trim()
  if (typeof linked === 'string' && linked.trim()) return linked.trim()
  return null
}

function questionSectionTitle(question) {
  return normalizeTitle(
    question?.section_title ??
      question?.section_name ??
      question?.['Section Title'] ??
      question?.['Section Name'] ??
      question?.sectionTitle ??
      question?.sectionName ??
      ''
  )
}

function questionSectionOrder(question) {
  const sectionId = questionSectionId(question)
  if (sectionId && !/^rec[a-z0-9]+$/i.test(sectionId)) {
    const fromId = Number(sectionId)
    if (Number.isFinite(fromId) && fromId > 0) return fromId
  }
  const n = Number(
    question?.section_order ??
      question?.section_sort_order ??
      question?.sectionOrder ??
      question?.['Section Order'] ??
      question?.['Section Number'] ??
      question?.['Section No'] ??
      question?.section_number ??
      0
  )
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

function collectLiveQuestionsBySection(template, existingSections) {
  const byId = new Map()
  const add = (question, section) => {
    if (!question || typeof question !== 'object') return
    const id = String(question.id ?? question.question_key ?? '')
    if (!id || byId.has(id)) return
    const sectionId = questionSectionId(question) || (section?.id != null ? String(section.id) : null)
    const sectionTitle = questionSectionTitle(question) || normalizeTitle(section?.title || section?.name || '')
    const sectionNo = questionSectionOrder(question) || sectionOrder(section)
    byId.set(id, { question, sectionId, sectionTitle, sectionNo })
  }

  for (const section of existingSections) {
    for (const question of Array.isArray(section?.questions) ? section.questions : []) {
      add(question, section)
    }
  }
  for (const question of Array.isArray(template.questions) ? template.questions : []) {
    add(question, null)
  }

  return [...byId.values()]
}

function questionsForSection(liveQuestions, section, order, titleKey) {
  const sectionId = section?.id != null ? String(section.id) : null
  return sortQuestions(
    liveQuestions
      .filter((entry) => {
        if (sectionId && entry.sectionId && entry.sectionId === sectionId) return true
        if (entry.sectionTitle && entry.sectionTitle === titleKey) return true
        return entry.sectionNo != null && entry.sectionNo === order
      })
      .map((entry) => ({
        ...entry.question,
        section_id: sectionId || entry.question.section_id || entry.question.sectionId || null,
      }))
  )
}

export function replaceWithCanonicalEsmTemplate(template) {
  if (!template || !isEsmInspectionFormTemplate(template)) return template

  const existingSections = Array.isArray(template.sections) ? template.sections : []
  const liveQuestions = collectLiveQuestionsBySection(template, existingSections)
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
    const sectionId = existing?.id || `esm_live_section_${order}_${slug(title)}`
    return {
      ...(existing || {}),
      id: sectionId,
      title: numberedTitle,
      name: numberedTitle,
      sort_order: order,
      section_order: order,
      order,
      help_text: existing?.help_text ?? null,
      what_to_look_for: existing?.what_to_look_for ?? null,
      is_repeatable: existing?.is_repeatable ?? false,
      section_type: existing?.section_type || 'standard',
      questions: questionsForSection(liveQuestions, { ...(existing || {}), id: sectionId }, order, titleKey),
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
