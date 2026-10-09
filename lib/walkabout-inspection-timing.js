/**
 * Walkabout start/end times record the original inspection, not recovery or submit.
 */

function asDate(value) {
  if (value == null || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Persist a Walkabout finish time only when the officer recorded one.
 * Unknown end times stay blank — never substitute the recovery/submit clock.
 *
 * @param {{ requestEndTime?: Date | string | null, storedEndTime?: Date | string | null }} opts
 * @returns {Date | null}
 */
export function resolveWalkaboutInspectionEndTime({ requestEndTime = null, storedEndTime = null } = {}) {
  return asDate(requestEndTime) || asDate(storedEndTime) || null
}

/**
 * End time written on POST /submit.
 * Non-Walkabout forms keep the historical default of submit time when blank.
 *
 * @param {{
 *   isNeighbourhoodVoice?: boolean,
 *   isWalkabout?: boolean,
 *   requestEndTime?: Date | string | null,
 *   storedEndTime?: Date | string | null,
 *   submittedAt?: Date | string | null,
 * }} opts
 */
export function resolveSubmittedInspectionEndTime({
  isNeighbourhoodVoice = false,
  isWalkabout = false,
  requestEndTime = null,
  storedEndTime = null,
  submittedAt = null,
} = {}) {
  if (isNeighbourhoodVoice) return null
  if (isWalkabout) {
    return resolveWalkaboutInspectionEndTime({ requestEndTime, storedEndTime })
  }
  return asDate(requestEndTime) || asDate(submittedAt) || null
}

/**
 * Duration only when both start and end were entered. Blank end must not
 * be treated as "now".
 */
export function walkaboutDurationLabel(startValue, endValue) {
  const start = asDate(startValue)
  const end = asDate(endValue)
  if (!start || !end || end < start) return ''
  const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export const WALKABOUT_END_TIME_HELP =
  'Optional. Enter the time this inspection actually finished. Leave blank if that time is not known. Do not enter the time you are recovering or submitting this inspection.'
