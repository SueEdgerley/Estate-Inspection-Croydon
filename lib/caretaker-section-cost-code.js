import { resolveStoredQuestionType } from '@/lib/resolveStoredQuestionType'

/**
 * First answered "cost code" style single_select in the section (Neon-backed dropdown in UI).
 * @param {Record<string, unknown> | null | undefined} section
 * @param {Record<string, unknown>} answers
 * @returns {string | null}
 */
export function findSectionCostCodeAnswer(section, answers) {
  for (const q of section?.questions || []) {
    if (!q || !q.id) continue
    if (resolveStoredQuestionType(q) !== 'single_select') continue
    const t = String(q.label || q.question_text || '').toLowerCase()
    if (!t.includes('cost') || !t.includes('code')) continue
    const v = answers[q.id]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}
