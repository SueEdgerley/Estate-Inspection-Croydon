const INTERNAL_LABELS = new Set([
  'action category',
  'date/time',
  'email/routing',
  'inspection',
  'inspection id',
  'photo reference',
  'photo references',
  'photo reference(s)',
  'recipient',
])

const ALLOWED_LABELS = new Set([
  'answer',
  'block',
  'comment',
  'estate / block',
  'estate/block',
  'issue',
  'item',
  'location',
  'question',
  'rating',
  'section',
  'submitted by',
])

const INTERNAL_TOKEN_LABELS = new Set([
  'auto_created',
  'esm_photo_comment_issue',
  'external_cleaning',
  'fire_safety',
  'grounds_maintenance',
  'health_safety',
  'parking_abandoned_vehicle',
])

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const ACTION_ID_PATTERN = /\baction_[a-z0-9-]+(?:_[a-z0-9-]+)+\b/gi
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/gi
const URL_PATTERN = /https?:\/\/\S+/gi

export function parseActionPhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim())
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseActionPhotoUrls(JSON.parse(raw))
    } catch {
      return raw.startsWith('http') ? [raw] : []
    }
  }
  return []
}

export function formatActionDate(value, { includeTime = false, fallback = 'Not recorded' } = {}) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function displayActionStatus(value, fallback = 'Open') {
  const status = String(value || fallback).replace(/[_-]+/g, ' ').trim()
  return status.replace(/\b\w/g, (char) => char.toUpperCase())
}

export function cleanActionDisplayText(value, { preserveLabels = false } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return ''
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) return ''

  const lines = text
    .replace(URL_PATTERN, '')
    .replace(UUID_PATTERN, '')
    .replace(ACTION_ID_PATTERN, '')
    .replace(ISO_DATE_PATTERN, '')
    .split(/\r?\n/)
    .map((line) => cleanDisplayLine(line, preserveLabels))
    .filter(Boolean)

  return lines.join('\n').replace(/[ \t]{2,}/g, ' ').trim()
}

function cleanDisplayLine(line, preserveLabels) {
  let text = String(line || '').trim()
  if (!text) return ''
  const labelled = text.match(/^([^:]+):\s*(.*)$/)
  if (labelled) {
    const label = labelled[1].trim()
    const labelKey = normalizeLabel(label)
    const value = labelled[2].trim()
    if (INTERNAL_LABELS.has(labelKey)) return ''
    if (!ALLOWED_LABELS.has(labelKey) && isInternalToken(label)) return ''
    const cleanValue = cleanInlineText(value)
    if (!cleanValue) return ''
    return preserveLabels ? `${humanizeLabel(label)}: ${cleanValue}` : cleanValue
  }
  text = cleanInlineText(text)
  if (!text || isInternalToken(text)) return ''
  return text
}

function cleanInlineText(value) {
  return String(value || '')
    .replace(URL_PATTERN, '')
    .replace(UUID_PATTERN, '')
    .replace(ACTION_ID_PATTERN, '')
    .replace(ISO_DATE_PATTERN, '')
    .replace(/\b[a-z]+(?:_[a-z0-9]+){2,}\b/gi, '')
    .replace(/\s+([,;:.])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function humanizeLabel(value) {
  const label = normalizeLabel(value).replace(/[_-]+/g, ' ')
  return label.replace(/\b\w/g, (char) => char.toUpperCase())
}

function isInternalToken(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return INTERNAL_TOKEN_LABELS.has(normalized) || /^esm_[a-z0-9_]+$/.test(normalized)
}

export function categoryLabel(value) {
  const raw = String(value || '').trim()
  if (!raw || /^esm_[a-z0-9_]+$/i.test(raw)) return ''
  const cleaned = cleanInlineText(raw)
  if (!cleaned) return ''
  return displayActionStatus(cleaned)
}

export function actionInspectionDate(action) {
  return action?.inspection_submitted_at || action?.inspection_created_at || action?.created_at || action?.inspection_due_date
}

export function buildActionDisplay(action = {}) {
  const parsed = parseLabelledDescription(action.description)
  const photos = [
    ...parseActionPhotoUrls(action.repair_photo_url),
    ...parseActionPhotoUrls(action.photo_urls),
  ]
  const section = firstCleanText(action.section_name, parsed.section, categoryLabel(action.category))
  const issue = firstCleanText(
    action.title,
    parsed.question,
    parsed.issue,
    parsed.item,
    action.question_text,
    action.comment,
    action.description
  )
  const comment = firstCleanText(action.comment, parsed.comment, action.description)
  const location = firstCleanText(
    action.estate_block_name,
    action.block_name,
    action.estate_name,
    parsed['estate / block'],
    parsed['estate/block'],
    action.location
  )
  const blockLocation = firstCleanText(
    action.inspection_location_label,
    action.location,
    parsed.location,
    parsed.block
  )
  const submittedBy = firstCleanText(action.created_by, parsed['submitted by'])
  const rating = firstCleanText(action.rating, parsed.rating, parsed.answer)

  return {
    section,
    issue,
    rating,
    comment,
    location,
    blockLocation,
    status: displayActionStatus(action.status),
    priority: categoryLabel(action.priority),
    submittedBy,
    assignedTo: cleanActionDisplayText(action.assigned_to),
    jobNumber: cleanActionDisplayText(action.job_number),
    repairNotes: cleanActionDisplayText(action.repair_notes),
    inspectionDate: formatActionDate(actionInspectionDate(action)),
    createdDate: formatActionDate(action.created_at, { includeTime: true }),
    targetCompletionDate: formatActionDate(action.expected_completion_date || action.inspection_due_date),
    hasPhoto: photos.length > 0,
    photoUrls: photos,
  }
}

function firstCleanText(...values) {
  for (const value of values) {
    const cleaned = cleanActionDisplayText(value)
    if (cleaned) return cleaned
  }
  return ''
}

export function parseLabelledDescription(description) {
  const fields = {}
  for (const line of String(description || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.*)\s*$/)
    if (!match) continue
    const key = normalizeLabel(match[1])
    if (INTERNAL_LABELS.has(key)) continue
    const value = cleanActionDisplayText(match[2])
    if (value) fields[key] = value
  }
  return fields
}
