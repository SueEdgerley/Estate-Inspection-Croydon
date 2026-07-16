/**
 * Detect Neon / Postgres service-limit errors and map them to safe API responses.
 * Full technical detail must be logged server-side only — never returned to clients.
 */

export function isDatabaseQuotaError(err) {
  if (!err) return false
  const status = err.status ?? err.statusCode ?? err.httpStatus
  if (status === 402 || status === '402') return true
  const msg = String(err.message || err.toString() || '').toLowerCase()
  return (
    msg.includes('data transfer quota') ||
    msg.includes('exceeded the data transfer') ||
    (msg.includes('402') && msg.includes('quota'))
  )
}

export function isDatabaseTransientError(err) {
  if (!err) return false
  if (isDatabaseQuotaError(err)) return true
  const msg = String(err.message || '').toLowerCase()
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('too many connections')
  )
}

export function logDatabaseServiceError(context, err, extra = {}) {
  console.error(`[${context}] database service error`, {
    ...extra,
    message: err?.message || String(err),
    code: err?.code ?? null,
    status: err?.status ?? err?.statusCode ?? null,
    name: err?.name ?? null,
    stack: err?.stack ?? null,
  })
}

/** User-safe payload for dashboard / overview endpoints. */
export function dashboardUnavailablePayload() {
  return {
    error: 'Dashboard temporarily unavailable',
    code: 'DASHBOARD_UNAVAILABLE',
    message: "We're unable to retrieve the latest dashboard statistics at the moment.",
    hint: 'You can still use the application normally, including inspections, reports and actions.',
  }
}
