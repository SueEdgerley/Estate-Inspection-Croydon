/**
 * Completion date rules for an action.
 *
 * Closed and Completed are separate statuses in the tracker. Closed does not
 * mean the work was completed, so it does not record a completion date.
 * It also is not a reopen, so it does not clear a completion date already saved.
 *
 * - Any other status -> Completed: save the current date/time.
 * - Completed -> Open or In Progress: clear it. The work has been reopened.
 * - Completed -> Closed: leave the saved time unchanged.
 * - Completed -> Completed: leave the saved time unchanged.
 * - Open or In Progress -> Closed: leave it unchanged, so no date is invented.
 *
 * A completed action from before this field existed stays blank. Saving it
 * again without leaving and re-entering Completed does not invent a date.
 * Completing it again after it has been reopened stores the new time only.
 */
export function normalizeActionStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function nextCompletionTimestamp(previousStatus, nextStatus, now = new Date()) {
  const previous = normalizeActionStatus(previousStatus)
  const next = normalizeActionStatus(nextStatus)
  if (next === 'completed' && previous !== 'completed') return now
  if (previous === 'completed' && (next === 'open' || next === 'in_progress')) return null
  return undefined
}
