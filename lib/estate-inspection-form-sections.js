/**
 * Estate inspection new-form only: normalize `sections` + `questions` so the UI always
 * groups by Template Sections (order fields / section ids), including Airtable shapes where
 * questions are only on `template.questions[]` or all rows were nested under empty arrays.
 */
import { getSectionsWithOrderedQuestions } from '@/lib/inspection-template-render-sections'
import {
  buildQuestionOriginalSectionIdMap,
  repartitionEstateInspectionQuestions,
} from '@/lib/estate-inspection-topic-section-routes'

function questionOrderNum(q) {
  const n = Number(q?.question_order ?? q?.sort_order ?? q?.order ?? 0)
  return Number.isFinite(n) ? n : 0
}

function sortQuestions(qs) {
  return [...(qs || [])].sort((a, b) => questionOrderNum(a) - questionOrderNum(b))
}

/** Section link from flat question rows (Airtable API shape or normalized snapshot). */
export function linkedSectionIdFromQuestion(q) {
  if (!q || typeof q !== 'object') return null
  const a = q.section_id ?? q.sectionId
  if (a != null && String(a).trim() !== '') return String(a).trim()
  const link = q.Section ?? q.section
  if (Array.isArray(link) && link.length) return String(link[0]).trim()
  if (link != null && typeof link !== 'object') return String(link).trim()
  return null
}

function totalQuestionCount(sections) {
  return (sections || []).reduce((n, s) => n + (Array.isArray(s.questions) ? s.questions.length : 0), 0)
}

function collectPlacedQuestionIds(sections) {
  const ids = new Set()
  for (const sec of sections || []) {
    for (const q of sec.questions || []) {
      if (q?.id != null) ids.add(String(q.id))
    }
  }
  return ids
}

/**
 * Merge `template.questions` into sections by `section_id` / `Section` link (dedupe by question id).
 * @param {Array<Record<string, unknown>>} sections
 * @param {unknown[]} flatRoot
 */
function mergeFlatIntoSections(sections, flatRoot) {
  if (!Array.isArray(sections) || sections.length === 0 || !Array.isArray(flatRoot) || flatRoot.length === 0) {
    return sections
  }
  const byId = new Map(
    sections.map((s) => [String(s.id), { ...s, questions: [...(Array.isArray(s.questions) ? s.questions : [])] }])
  )
  const placed = new Set()
  for (const s of byId.values()) {
    for (const q of s.questions) {
      if (q?.id != null) placed.add(String(q.id))
    }
  }
  for (const q of flatRoot) {
    const sid = linkedSectionIdFromQuestion(q)
    if (!sid || !byId.has(sid)) continue
    const qid = q?.id != null ? String(q.id) : null
    if (qid && placed.has(qid)) continue
    if (qid) placed.add(qid)
    byId.get(sid).questions.push(q)
  }
  return sections.map((s) => {
    const block = byId.get(String(s.id))
    return { ...s, questions: sortQuestions(block?.questions || []) }
  })
}

/**
 * @param {Record<string, unknown> | null | undefined} template
 * @returns {Array<Record<string, unknown> & { questions: unknown[] }>}
 */
export function buildEstateInspectionFormSections(template) {
  if (!template || typeof template !== 'object') return []

  const flatRoot = Array.isArray(template.questions) ? template.questions : []
  let sections = getSectionsWithOrderedQuestions(template)
  sections = mergeFlatIntoSections(sections, flatRoot)

  const placedIds = collectPlacedQuestionIds(sections)
  const orphans = flatRoot.filter((q) => {
    if (!q || q.id == null) return false
    if (placedIds.has(String(q.id))) return false
    return !linkedSectionIdFromQuestion(q)
  })
  if (orphans.length > 0 && sections.length > 0) {
    sections = [
      { ...sections[0], questions: sortQuestions([...(sections[0].questions || []), ...orphans]) },
      ...sections.slice(1),
    ]
  }

  let total = totalQuestionCount(sections)

  if (total === 0 && flatRoot.length > 0) {
    const sorted = sortQuestions(flatRoot)
    if (sections.length > 0) {
      sections = [
        { ...sections[0], questions: sorted },
        ...sections.slice(1).map((s) => ({ ...s, questions: [] })),
      ]
      total = sorted.length
    } else {
      sections = [
        {
          id: 'estate-default-section',
          title: 'Estate inspection',
          sort_order: 0,
          help_text: null,
          what_to_look_for: null,
          questions: sorted,
        },
      ]
    }
  }

  const questionsForLinks = []
  const seenLink = new Set()
  for (const sec of sections) {
    for (const q of sec.questions || []) {
      if (!q?.id || seenLink.has(String(q.id))) continue
      seenLink.add(String(q.id))
      questionsForLinks.push(q)
    }
  }
  for (const q of flatRoot) {
    if (!q?.id || seenLink.has(String(q.id))) continue
    seenLink.add(String(q.id))
    questionsForLinks.push(q)
  }
  const linkSidByQid = buildQuestionOriginalSectionIdMap(questionsForLinks)
  sections = repartitionEstateInspectionQuestions(sections, linkSidByQid)

  return sections
}
