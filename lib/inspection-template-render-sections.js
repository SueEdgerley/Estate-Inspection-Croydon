import { firstLinkedRecordId } from '@/lib/airtable-linked-record-id'

/**
 * Section id from a question row (flat list or nested), for matching `section.id`.
 * @param {Record<string, unknown> | null | undefined} q
 */
export function questionLinkedSectionId(q) {
  if (!q || typeof q !== 'object') return null
  const a = q.section_id ?? q.sectionId
  if (a != null && String(a).trim() !== '') return String(a).trim()
  return firstLinkedRecordId(q.Section ?? q.section)
}

/**
 * Build ordered section → questions lists for inspection forms.
 * Uses template relationships only (section ids + question.section_id), not question text.
 *
 * - Sections: `section_order` → `sort_order` → `order` (numeric, ascending).
 * - Questions: `question_order` → `sort_order` → `order` (numeric, ascending).
 *
 * Shapes supported:
 * 1. Nested: `template.sections[].questions[]` (typical Airtable / snapshot).
 * 2. Flat questions: `template.questions[]` with `section_id` (or `sectionId`) matching `section.id`.
 */

function sectionOrderNum(sec) {
  const n = Number(sec?.esm_display_order ?? sec?.section_order ?? sec?.sort_order ?? sec?.order ?? 0)
  return Number.isFinite(n) ? n : 0
}

function questionOrderNum(q) {
  const n = Number(q?.question_order ?? q?.sort_order ?? q?.order ?? 0)
  return Number.isFinite(n) ? n : 0
}

function sortQuestionsInPlaceCopy(questions) {
  return [...(questions || [])].sort((a, b) => {
    const d = questionOrderNum(a) - questionOrderNum(b)
    if (d !== 0) return d
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  })
}

/**
 * @param {Record<string, unknown> | null | undefined} template
 * @returns {Array<Record<string, unknown> & { questions: unknown[] }>}
 */
export function getSectionsWithOrderedQuestions(template) {
  if (!template || typeof template !== 'object') return []

  const sectionsIn = Array.isArray(template.sections) ? template.sections : []
  const flatQuestions = Array.isArray(template.questions) ? template.questions : []

  const sortedShells = [...sectionsIn].sort((a, b) => sectionOrderNum(a) - sectionOrderNum(b))

  const hasNestedQuestions = sortedShells.some(
    (s) => Array.isArray(s.questions) && s.questions.length > 0
  )

  const hasFlatWithSectionId =
    flatQuestions.length > 0 &&
    flatQuestions.some((q) => {
      const sid = questionLinkedSectionId(q)
      return sid != null && sid !== ''
    })

  if (hasNestedQuestions) {
    return sortedShells.map((sec) => ({
      ...sec,
      questions: sortQuestionsInPlaceCopy(sec.questions),
    }))
  }

  if (sortedShells.length > 0 && hasFlatWithSectionId) {
    return sortedShells.map((sec) => {
      const sid = sec.id
      const qs = flatQuestions.filter((q) => {
        const qSid = questionLinkedSectionId(q)
        return qSid != null && String(qSid) === String(sid)
      })
      return { ...sec, questions: sortQuestionsInPlaceCopy(qs) }
    })
  }

  return sortedShells.map((sec) => ({
    ...sec,
    questions: sortQuestionsInPlaceCopy(sec.questions),
  }))
}
