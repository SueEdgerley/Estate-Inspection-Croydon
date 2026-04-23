/**
 * Temporary diagnostics for template_version / inspection snapshot drift (Airtable vs stored JSON).
 */

/**
 * @param {unknown} tv - template_version JSON (or live template with sections)
 * @returns {{
 *   templateIdInSnapshot: string | null,
 *   templateNameInSnapshot: string | null,
 *   totalSections: number,
 *   totalQuestions: number,
 *   perSection: Array<{ index: number, sectionId: unknown, title: string, sort_order: unknown, questionCount: number }>,
 *   rawNull?: boolean
 * }}
 */
export function summarizeTemplateSnapshotForDebug(tv) {
  if (!tv || typeof tv !== 'object') {
    return {
      templateIdInSnapshot: null,
      templateNameInSnapshot: null,
      totalSections: 0,
      totalQuestions: 0,
      perSection: [],
      rawNull: true,
    }
  }
  const sections = Array.isArray(tv.sections) ? tv.sections : []
  let totalQuestions = 0
  const perSection = sections.map((sec, index) => {
    const qs = Array.isArray(sec.questions) ? sec.questions : []
    totalQuestions += qs.length
    return {
      index,
      sectionId: sec.id,
      title: String(sec.title || sec.name || ''),
      sort_order: sec.sort_order ?? sec.order ?? sec.section_order ?? null,
      questionCount: qs.length,
    }
  })
  return {
    templateIdInSnapshot: tv.id != null ? String(tv.id) : null,
    templateNameInSnapshot: tv.name != null ? String(tv.name) : null,
    totalSections: sections.length,
    totalQuestions,
    perSection,
  }
}

/**
 * @param {Record<string, unknown>} args
 */
export function logInspectionTemplateDebug(args) {
  try {
    console.debug('[inspection-template-debug]', args)
  } catch {
    /* ignore */
  }
}
