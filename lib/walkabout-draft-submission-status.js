/**
 * Classify local Walkabout drafts against production records.
 * Pure helpers — no localStorage writes and no database writes.
 */

export const WALKABOUT_DRAFT_SUBMISSION = {
  SUBMITTED: 'submitted',
  NOT_SUBMITTED: 'not_submitted',
  UNKNOWN: 'unknown',
}

export function londonDateKey(value) {
  if (value == null || value === '') return ''
  const raw = String(value).trim()
  const ymd = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd && !/[T\s]/.test(raw.slice(10))) return ymd[1]
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ymd ? ymd[1] : ''
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date)
  } catch {
    return ymd ? ymd[1] : ''
  }
}

export function normalizeWalkaboutLocation(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function draftInspectionDateKey(draft) {
  const answers = draft?.payload?.submitBody?.answers || {}
  return londonDateKey(
    answers.ew_sig_inspection_date ||
      answers.ew_q_planned_date ||
      draft?.payload?.submitBody?.inspection_start_time
  )
}

export function isSubmittedInspectionRow(row) {
  if (!row || typeof row !== 'object') return false
  const status = String(row.status || '').toLowerCase().trim()
  if (status === 'submitted' || status === 'completed' || status === 'complete') return true
  return Boolean(row.submitted_at)
}

export function isWalkaboutInspectionRow(row) {
  if (!row || typeof row !== 'object') return false
  const templateId = String(row.template_id || '').trim()
  const type = String(row.type || '').toLowerCase().trim()
  const name = String(row.template_name || '').toLowerCase().trim()
  return (
    templateId === 'tpl_estate_walkabout_v1' ||
    type === 'estate_walkabout' ||
    name === 'estate walkabout'
  )
}

export function locationsLikelySame(draft, row) {
  const blockId = String(draft?.payload?.submitBody?.block_id || draft?.payload?.blockId || '').trim()
  const rowBlock = String(row?.block_id || '').trim()
  if (blockId && rowBlock && blockId === rowBlock) return true
  const draftLoc = normalizeWalkaboutLocation(
    draft?.payload?.locationLabel || draft?.payload?.submitBody?.location || draft?.payload?.location
  )
  const rowLoc = normalizeWalkaboutLocation(row?.block_name || row?.location_label)
  return Boolean(draftLoc && rowLoc && draftLoc === rowLoc)
}

export function findMatchingSubmittedInspection(draft, submittedRows = []) {
  const dateKey = draftInspectionDateKey(draft)
  if (!dateKey) return null
  const matches = (Array.isArray(submittedRows) ? submittedRows : []).filter((row) => {
    if (!isSubmittedInspectionRow(row)) return false
    if (row.template_id || row.type || row.template_name) {
      if (!isWalkaboutInspectionRow(row)) return false
    }
    if (!locationsLikelySame(draft, row)) return false
    const rowDate =
      londonDateKey(row.inspection_start_time) ||
      londonDateKey(row.submitted_at) ||
      londonDateKey(row.created_at)
    return rowDate === dateKey
  })
  return matches[0] || null
}

export function classifyWalkaboutDraftSubmission({
  draft,
  byId = null,
  submittedRows = null,
  listError = false,
  idError = false,
} = {}) {
  if (byId && isSubmittedInspectionRow(byId)) {
    return {
      status: WALKABOUT_DRAFT_SUBMISSION.SUBMITTED,
      source: 'id',
      matchedInspectionId: byId.id || null,
    }
  }
  if (byId && byId.id && !isSubmittedInspectionRow(byId)) {
    return {
      status: WALKABOUT_DRAFT_SUBMISSION.NOT_SUBMITTED,
      source: 'id',
      matchedInspectionId: byId.id,
    }
  }

  const leftover = Array.isArray(submittedRows)
    ? findMatchingSubmittedInspection(draft, submittedRows)
    : null
  if (leftover) {
    return {
      status: WALKABOUT_DRAFT_SUBMISSION.SUBMITTED,
      source: 'leftover',
      matchedInspectionId: leftover.id || null,
    }
  }

  if (!idError && !listError && Array.isArray(submittedRows)) {
    return {
      status: WALKABOUT_DRAFT_SUBMISSION.NOT_SUBMITTED,
      source: 'absent',
      matchedInspectionId: null,
    }
  }

  return {
    status: WALKABOUT_DRAFT_SUBMISSION.UNKNOWN,
    source: 'unverified',
    matchedInspectionId: null,
  }
}

export function walkaboutDraftResumeAllowed(status) {
  return status !== WALKABOUT_DRAFT_SUBMISSION.SUBMITTED
}

export function walkaboutDraftStatusLabel(status) {
  if (status === WALKABOUT_DRAFT_SUBMISSION.SUBMITTED) {
    return 'Already submitted — do not resume'
  }
  if (status === WALKABOUT_DRAFT_SUBMISSION.UNKNOWN) {
    return 'Submission status not confirmed'
  }
  return ''
}

export async function lookupWalkaboutDraftStatuses(drafts = [], { fetchImpl } = {}) {
  const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null)
  const rows = Array.isArray(drafts) ? drafts.filter((draft) => draft?.id) : []
  if (!fetchFn) {
    return Object.fromEntries(
      rows.map((draft) => [
        draft.id,
        classifyWalkaboutDraftSubmission({ draft, listError: true, idError: true }),
      ])
    )
  }

  let submittedRows = null
  let listError = false
  try {
    const res = await fetchFn('/api/inspections?completionScope=completed&type=estate_walkabout', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) {
      listError = true
    } else {
      const data = await res.json().catch(() => null)
      submittedRows = Array.isArray(data) ? data : []
    }
  } catch {
    listError = true
  }

  const byId = new Map()
  const idErrors = new Set()
  await Promise.all(
    rows.map(async (draft) => {
      try {
        const res = await fetchFn(`/api/inspections/${encodeURIComponent(draft.id)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (res.status === 404) {
          byId.set(draft.id, null)
          return
        }
        if (!res.ok) {
          idErrors.add(draft.id)
          return
        }
        const inspection = await res.json().catch(() => null)
        byId.set(draft.id, inspection && inspection.id ? inspection : null)
      } catch {
        idErrors.add(draft.id)
      }
    })
  )

  const out = {}
  for (const draft of rows) {
    out[draft.id] = classifyWalkaboutDraftSubmission({
      draft,
      byId: byId.get(draft.id) || null,
      submittedRows,
      listError,
      idError: idErrors.has(draft.id),
    })
  }
  return out
}
