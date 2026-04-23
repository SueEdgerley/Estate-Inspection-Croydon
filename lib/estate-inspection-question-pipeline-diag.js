/**
 * Server-side diagnostics: where Estate Inspection question counts drop
 * (Airtable → normalize → template_version → GET inspection).
 */

const PREFIX = '[estate-inspection-question-pipeline]'

/**
 * @param {Record<string, unknown> | null | undefined} templateOrSnapshot
 * @returns {{
 *   nestedInSections: number,
 *   topLevelQuestionsArray: number,
 *   uniqueQuestionIds: number,
 * }}
 */
export function countQuestionsInTemplate(templateOrSnapshot) {
  if (!templateOrSnapshot || typeof templateOrSnapshot !== 'object') {
    return { nestedInSections: 0, topLevelQuestionsArray: 0, uniqueQuestionIds: 0 }
  }
  const idSet = new Set()
  let nested = 0
  for (const sec of templateOrSnapshot.sections || []) {
    const qs = Array.isArray(sec.questions) ? sec.questions : []
    nested += qs.length
    for (const q of qs) {
      if (q?.id != null) idSet.add(String(q.id))
    }
  }
  const flat = Array.isArray(templateOrSnapshot.questions) ? templateOrSnapshot.questions : []
  for (const q of flat) {
    if (q?.id != null) idSet.add(String(q.id))
  }
  return {
    nestedInSections: nested,
    topLevelQuestionsArray: flat.length,
    uniqueQuestionIds: idSet.size,
  }
}

/**
 * @param {string} stage
 * @param {Record<string, unknown>} payload
 */
export function logInspectionQuestionPipeline(stage, payload) {
  try {
    console.log(PREFIX, stage, JSON.stringify(payload))
  } catch {
    console.log(PREFIX, stage, payload)
  }
}
