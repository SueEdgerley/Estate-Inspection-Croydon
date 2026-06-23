/**
 * Remove duplicate action rows returned by GET /api/actions when JOINs inflate rows.
 * Keeps the first row per action id (query is ordered by created_at DESC).
 */
export function deduplicateActionRowsById(actions) {
  if (!Array.isArray(actions) || !actions.length) return []
  const seen = new Set()
  const result = []
  for (const action of actions) {
    const id = action?.id
    if (!id) {
      result.push(action)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    result.push(action)
  }
  return result
}

/**
 * Remove duplicate actions from the same inspection + question (creation duplicates).
 * Keeps the most recent action for each inspection_id + question_id pair.
 */
export function deduplicateActionsByInspectionQuestion(actions) {
  if (!Array.isArray(actions) || !actions.length) return []
  const seen = new Map()

  const sorted = [...actions].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime()
    const bTime = new Date(b.created_at).getTime()
    return bTime - aTime
  })

  for (const action of sorted) {
    if (!action.inspection_id || !action.question_id) {
      if (action.id && !seen.has(action.id)) {
        seen.set(action.id, action)
      }
      continue
    }

    const key = `${action.inspection_id}::${action.question_id}`
    if (!seen.has(key)) {
      seen.set(key, action)
    }
  }

  return Array.from(seen.values())
}

/**
 * Full client/API dedupe: JOIN inflation first, then inspection+question duplicates.
 */
export function deduplicateActions(actions) {
  return deduplicateActionsByInspectionQuestion(deduplicateActionRowsById(actions))
}
