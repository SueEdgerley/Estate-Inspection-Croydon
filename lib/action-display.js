import {
  buildActionDisplay,
  categoryLabel,
  cleanActionDisplayText,
  parseLabelledDescription,
} from '@/lib/action-display-formatter'

const DETAIL_FIELD_ORDER = [
  ['section', 'Section'],
  ['estate / block', 'Estate / block'],
  ['estate/block', 'Estate / block'],
  ['location', 'Location'],
  ['block', 'Block'],
  ['question', 'Question'],
  ['answer', 'Answer'],
  ['rating', 'Rating'],
  ['comment', 'Comment'],
  ['assigned to', 'Assigned to'],
  ['submitted by', 'Submitted by'],
]

function normalizeComparableText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function textsAreEquivalent(...values) {
  const normalized = values.map(normalizeComparableText).filter(Boolean)
  if (normalized.length < 2) return false
  return normalized.every((value) => value === normalized[0])
}

export function truncateText(text, maxLen = 120) {
  const value = String(text || '').trim()
  if (!value || value.length <= maxLen) {
    return { text: value, truncated: false }
  }
  const slice = value.slice(0, maxLen)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice
  return { text: `${cut.trim()}…`, truncated: true }
}

/**
 * Parse labelled description lines into display-safe fields (no URLs, IDs, or internal tokens).
 */
export function parseActionDescriptionForDisplay(description) {
  const parsed = parseLabelledDescription(description)
  const fields = {}

  for (const [key, label] of DETAIL_FIELD_ORDER) {
    if (parsed[key] && !fields[label]) {
      fields[label] = parsed[key]
    }
  }

  const categoryFromParsed = cleanActionDisplayText(parsed['action category'])
  if (categoryFromParsed) {
    fields['Action category'] = categoryLabel(categoryFromParsed) || categoryFromParsed
  }

  return fields
}

/**
 * Compact card summary for inspection action lists.
 */
function userFacingActionComment(action = {}, parsed = {}) {
  const directComment = cleanActionDisplayText(action.comment)
  if (directComment && !looksLikeStructuredActionPayload(action.comment)) {
    return directComment
  }
  return cleanActionDisplayText(parsed.comment) || ''
}

function looksLikeStructuredActionPayload(text) {
  const raw = String(text || '')
  if (!raw.trim()) return false
  return /(?:^|[\n\r])\s*(Inspection ID|Question|Answer|Photo reference|Estate \/ block|Action category|Date\/time)\s*:/i.test(raw)
    || /\bInspection ID:\s*\S/i.test(raw)
}

export function getActionDisplaySummary(action = {}) {
  const display = buildActionDisplay(action)
  const parsed = parseLabelledDescription(action.description)
  const title = display.issue || cleanActionDisplayText(action.title) || 'Action'
  const fullComment = userFacingActionComment(action, parsed)
  let previewComment = fullComment

  if (!previewComment || textsAreEquivalent(previewComment, title)) {
    previewComment = ''
  }

  const location = display.blockLocation || display.specificLocation || ''
  const estateBlock = display.estateBlockLocation || ''
  const category = categoryLabel(action.category) || display.section || ''
  const { text: previewText, truncated: previewTruncated } = truncateText(previewComment)

  return {
    title,
    previewComment: previewText,
    previewTruncated,
    fullComment,
    location,
    estateBlock,
    submittedBy: display.submittedBy,
    dateLabel: display.createdDate,
    status: display.status,
    category,
    photoUrls: display.photoUrls,
    photoCount: display.photoUrls.length,
    display,
  }
}

function detailValueDuplicatesSummary(label, value, summary) {
  const cleaned = cleanActionDisplayText(value)
  if (!cleaned) return true
  if (label === 'Comment' && (textsAreEquivalent(cleaned, summary.fullComment) || textsAreEquivalent(cleaned, summary.title))) {
    return true
  }
  if (label === 'Question' && textsAreEquivalent(cleaned, summary.title)) {
    return true
  }
  if (label === 'Section') {
    const sectionText = normalizeComparableText(cleaned)
    const titleText = normalizeComparableText(summary.title)
    if (sectionText && titleText.includes(sectionText)) return true
  }
  if (label === 'Estate / block' && textsAreEquivalent(cleaned, summary.estateBlock)) {
    return true
  }
  if (label === 'Location' && textsAreEquivalent(cleaned, summary.location)) {
    return true
  }
  if (label === 'Answer' && textsAreEquivalent(cleaned, summary.title)) {
    return true
  }
  return false
}

/**
 * Rows for the expandable "View details" panel (formatted metadata, no raw URLs).
 */
export function getActionDetailFields(action = {}) {
  const summary = getActionDisplaySummary(action)
  const parsed = parseActionDescriptionForDisplay(action.description)
  const rows = []
  const seen = new Set()

  const addRow = (label, value) => {
    const cleaned = cleanActionDisplayText(value)
    if (!cleaned || detailValueDuplicatesSummary(label, cleaned, summary)) return
    const key = `${label}:${normalizeComparableText(cleaned)}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ label, value: cleaned })
  }

  if (summary.category) addRow('Action category', summary.category)
  if (summary.estateBlock) addRow('Estate / block', summary.estateBlock)
  if (summary.location) addRow('Location', summary.location)

  for (const [parsedKey, label] of DETAIL_FIELD_ORDER) {
    if (parsed[label]) addRow(label, parsed[label])
    else if (parsedKey === 'section' && summary.display.section) addRow('Section', summary.display.section)
  }

  if (summary.fullComment && !textsAreEquivalent(summary.fullComment, summary.title)) {
    addRow('Comment', summary.fullComment)
  }

  if (summary.display.rating) addRow('Rating', summary.display.rating)
  if (summary.display.assignedTo) addRow('Assigned to', summary.display.assignedTo)
  if (summary.submittedBy) addRow('Submitted by', summary.submittedBy)
  if (summary.display.priority) addRow('Priority', summary.display.priority)
  if (summary.display.jobNumber) addRow('Job number', summary.display.jobNumber)
  if (summary.display.repairNotes) addRow('Notes / update', summary.display.repairNotes)
  if (summary.dateLabel) addRow('Submitted', summary.dateLabel)
  if (summary.display.targetCompletionDate && summary.display.targetCompletionDate !== 'Not recorded') {
    addRow('Target completion', summary.display.targetCompletionDate)
  }

  return rows
}
