/**
 * Estate inspection new-form only: normalize `sections` + `questions` using **Airtable** links and
 * order fields (section order, question order). Does not re-group rows by topic heuristics.
 */
import {
  getSectionsWithOrderedQuestions,
  questionLinkedSectionId,
} from '@/lib/inspection-template-render-sections'

function questionOrderNum(q) {
  const n = Number(q?.question_order ?? q?.sort_order ?? q?.order ?? 0)
  return Number.isFinite(n) ? n : 0
}

function sortQuestions(qs) {
  return [...(qs || [])].sort((a, b) => {
    const d = questionOrderNum(a) - questionOrderNum(b)
    if (d !== 0) return d
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  })
}

/**
 * Same Airtable question linked twice into one section: keep the first row after Question Order sort.
 * Does not reorder by text — order is strictly Airtable `question_order` / `sort_order` / `order`.
 */
function dedupeQuestionsInSectionStableById(qs) {
  const sorted = sortQuestions(qs || [])
  const seen = new Set()
  const out = []
  for (const q of sorted) {
    if (!q?.id) {
      out.push(q)
      continue
    }
    const id = String(q.id)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(q)
  }
  return out
}

/** Section link from flat question rows (Airtable API shape or normalized snapshot). */
export function linkedSectionIdFromQuestion(q) {
  return questionLinkedSectionId(q)
}

function totalQuestionCount(sections) {
  return (sections || []).reduce((n, s) => n + (Array.isArray(s.questions) ? s.questions.length : 0), 0)
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

  let total = totalQuestionCount(sections)

  /** Last resort only: no nested questions but flat list exists (mis-linked data). */
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

  for (const sec of sections) {
    sec.questions = dedupeQuestionsInSectionStableById(sec.questions)
  }

  return sections
}
