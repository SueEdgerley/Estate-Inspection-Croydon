/**
 * Estate Walkabout PDF helpers — expand structured checklist answers into
 * findings-table rows (Caretaker-style), never print raw JSON.
 */

export const ESTATE_WALKABOUT_CHECKLIST_QID = 'ew_checklist_json'

function normalizePhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim())
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return normalizePhotoUrls(JSON.parse(raw))
    } catch {
      return raw.startsWith('http') || raw.startsWith('data:') ? [raw.trim()] : []
    }
  }
  return []
}

export function isWalkaboutChecklistQuestionId(questionId) {
  return String(questionId || '') === ESTATE_WALKABOUT_CHECKLIST_QID
}

/**
 * Parse the stored checklist answer (JSON string or array) into item objects.
 * @param {unknown} raw
 * @returns {object[]}
 */
export function parseWalkaboutChecklistAnswer(raw) {
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === 'object')
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * True when an answer value is the checklist JSON blob (should never print as-is).
 */
export function looksLikeWalkaboutChecklistJson(raw) {
  const s = String(raw || '').trim()
  if (!s.startsWith('[')) return false
  try {
    const parsed = JSON.parse(s)
    if (!Array.isArray(parsed) || parsed.length === 0) return false
    const first = parsed[0]
    return (
      first &&
      typeof first === 'object' &&
      ('description' in first || 'action_required' in first || 'photo_urls' in first)
    )
  } catch {
    return false
  }
}

function checklistItemQuestionId(item, index) {
  const id = String(item?.id || '').trim() || `row_${index}`
  return `ew_chk_${id}`.slice(0, 120)
}

/**
 * Build findings-table rows + photo attachments for Walkabout additional items.
 *
 * @param {object[]} items
 * @param {{
 *   responsibleOfficerName?: string,
 *   actionPhotoUrlsByQuestionId?: Map<string, string[]>|Record<string, string[]>,
 * }} [opts]
 * @returns {{ questions: object[], photos: { questionId: string, url: string }[] }}
 */
export function buildWalkaboutChecklistPdfRows(items, opts = {}) {
  const responsibleOfficerName = String(opts.responsibleOfficerName || '').trim()
  const actionPhotos = opts.actionPhotoUrlsByQuestionId || {}
  const getActionPhotos = (qid) => {
    if (actionPhotos instanceof Map) return actionPhotos.get(qid) || []
    return actionPhotos[qid] || []
  }

  const questions = []
  const photos = []

  ;(items || []).forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const description = String(item.description || '').trim()
    const actionSummary = String(item.action_summary || '').trim()
    const orderRef = String(item.order_raised_number || item.order_number || item.job_number || '').trim()
    const status = String(item.status || '').trim()
    const actionRequired = Boolean(item.action_required)
    const itemPhotos = normalizePhotoUrls(item.photo_urls)
    const qid = checklistItemQuestionId(item, index)
    const mergedPhotos = [
      ...itemPhotos,
      ...normalizePhotoUrls(getActionPhotos(qid)),
    ].filter((url, i, arr) => url && arr.indexOf(url) === i)

    if (!description && !actionSummary && !orderRef && !mergedPhotos.length && !actionRequired) {
      return
    }

    const detailLines = [
      `Action required: ${actionRequired ? 'Yes' : 'No'}`,
      actionSummary ? `Action summary: ${actionSummary}` : '',
      orderRef ? `Order reference: ${orderRef}` : '',
      status && status !== '—' ? `Status: ${status}` : '',
      responsibleOfficerName ? `Responsible officer: ${responsibleOfficerName}` : '',
    ].filter(Boolean)

    const title = description || actionSummary || 'Additional inspection item'
    questions.push({
      id: qid,
      text: [title, ...detailLines].join('\n'),
      answer: actionRequired ? 'Yes' : 'No',
      rating: actionRequired ? 'Yes' : 'No',
      resultMode: 'simple_yes_no',
      hasIssue: actionRequired,
    })

    for (const url of mergedPhotos) {
      photos.push({ questionId: qid, url })
    }
  })

  return { questions, photos }
}
