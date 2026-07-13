/**
 * Request sequencing for Analytics fetches.
 * Ensures an older in-flight response cannot overwrite a newer filter selection.
 */

export function createAnalyticsLoadGuard() {
  let seq = 0
  return {
    nextRequest() {
      seq += 1
      return seq
    },
    isCurrentRequest(requestSeq) {
      return requestSeq === seq
    },
    get currentSeq() {
      return seq
    },
  }
}

/**
 * Minimal fetch policy model mirroring the Analytics page:
 * - fetch on initial load and Apply only (not on individual filter edits)
 * - ignore stale responses
 * - banner/metrics share one payload object from the accepted response
 */
export class AnalyticsFetchSession {
  constructor() {
    this.guard = createAnalyticsLoadGuard()
    this.fetchCount = 0
    this.payload = null
  }

  /** @param {'initial' | 'apply'} reason */
  startFetch(reason) {
    this.fetchCount += 1
    const seq = this.guard.nextRequest()
    return { seq, reason }
  }

  triggerInitialLoad() {
    return this.startFetch('initial')
  }

  triggerApply() {
    return this.startFetch('apply')
  }

  /** Filter dropdown edits must not fetch until Apply. */
  onFilterFieldChange() {
    return null
  }

  /**
   * @param {number} seq
   * @param {object} data full analytics API body
   * @returns {boolean} whether the response was applied
   */
  acceptResponse(seq, data) {
    if (!this.guard.isCurrentRequest(seq)) return false
    this.payload = data
    return true
  }
}
