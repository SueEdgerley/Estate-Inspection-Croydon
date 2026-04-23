// Airtable client for read-only config
// Templates, Sections, Questions, and People are read from Airtable
// Server-side only - uses environment variables

import { applyNeighbourhoodVoicePatchesToList } from './neighbourhood-voice-template-patch.js'
import { applyCaretakerCanonicalTemplates } from './caretaker-canonical-template.js'
import { applyTemplateDisplayPatches } from './caretaker-fire-template-patch.js'
import { appendEstateWalkaboutTemplate } from './estate-walkabout-template.js'
import { applyGroundsMaintenanceTemplateStructure } from './grounds-maintenance-template.js'

const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

/** Cache for getBlocksCached: { data, expiresAt } */
let blocksCache = null

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

/**
 * Run an async fn; on 429, retry with backoff (Retry-After or exponential).
 * @param {() => Promise<T>} fn
 * @param {number} maxRetries
 * @returns {Promise<T>}
 */
async function with429Backoff(fn, maxRetries = 4) {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (err) {
      const status = err?.statusCode ?? err?.status
      if (status !== 429 || attempt >= maxRetries) throw err
      const retryAfterSec = Number(err?.response?.headers?.['retry-after'] ?? 0)
      const backoffMs = retryAfterSec ? retryAfterSec * 1000 : 500 * Math.pow(2, attempt)
      await sleep(backoffMs)
      attempt += 1
    }
  }
}

// Read at runtime so Vercel env vars are always picked up (no module-load caching)
function getAirtableBaseId() {
  return process.env.AIRTABLE_BASE_ID?.trim() || ''
}
function getAirtableKey() {
  return (
    process.env.AIRTABLE_API_TOKEN?.trim() ||
    process.env.AIRTABLE_API_KEY?.trim() ||
    ''
  )
}

/** TEMPORARY: safe diagnostics for Production auth issues (no secrets). Remove when resolved. */
function maskBaseIdForLog(id) {
  if (!id) return 'missing'
  const s = String(id)
  if (s.length <= 8) return '(short)'
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

/**
 * TEMPORARY: Production expects AIRTABLE_BASE_ID + AIRTABLE_API_TOKEN (optional AIRTABLE_API_KEY legacy fallback).
 * Logs prove which credential getAirtableKey() uses (token env if set, else API key).
 */
export function getAirtableDiagnosticsForLogging() {
  const baseId = getAirtableBaseId()
  const tokenPresent = Boolean(process.env.AIRTABLE_API_TOKEN?.trim())
  const keyPresent = Boolean(process.env.AIRTABLE_API_KEY?.trim())
  let credentialChosen = 'none'
  if (tokenPresent) credentialChosen = 'AIRTABLE_API_TOKEN'
  else if (keyPresent) credentialChosen = 'AIRTABLE_API_KEY'
  return {
    AIRTABLE_BASE_ID_present: Boolean(baseId),
    AIRTABLE_BASE_ID_preview: maskBaseIdForLog(baseId),
    AIRTABLE_API_TOKEN_present: tokenPresent,
    AIRTABLE_API_KEY_present: keyPresent,
    credential_chosen: credentialChosen,
    credential_kind:
      credentialChosen === 'AIRTABLE_API_KEY'
        ? 'api_key'
        : credentialChosen === 'AIRTABLE_API_TOKEN'
          ? 'api_token'
          : 'none',
  }
}

/**
 * TEMPORARY: safe JSON for GET /api/templates (no secrets). Remove when Production Airtable is verified.
 * @param {{ failing_table?: string | null, airtable_status_code?: number | null, grading_first_attempt?: object | null, note_fetch_order?: string | null }} extra
 */
export function getAirtableProductionDiagnostics(extra = {}) {
  const d = getAirtableDiagnosticsForLogging()
  const tokenPresent = d.AIRTABLE_API_TOKEN_present
  const keyPresent = d.AIRTABLE_API_KEY_present
  return {
    AIRTABLE_BASE_ID_present: d.AIRTABLE_BASE_ID_present,
    AIRTABLE_API_TOKEN_present: tokenPresent,
    AIRTABLE_API_KEY_present: keyPresent,
    both_credentials_set: !!(tokenPresent && keyPresent),
    credential_chosen: d.credential_chosen,
    /** If both TOKEN and KEY are set, getAirtableKey() uses TOKEN. */
    credential_winner_if_both_set:
      tokenPresent && keyPresent
        ? 'AIRTABLE_API_TOKEN'
        : tokenPresent
          ? 'AIRTABLE_API_TOKEN'
          : keyPresent
            ? 'AIRTABLE_API_KEY'
            : 'none',
    base_id_preview: d.AIRTABLE_BASE_ID_preview,
    failing_table: extra.failing_table ?? null,
    airtable_status_code: extra.airtable_status_code ?? null,
    grading_first_attempt: extra.grading_first_attempt ?? null,
    note_fetch_order:
      extra.note_fetch_order ??
      'Order in code: (1) Grading Schemes — errors are non-fatal and ignored. (2) Templates, Template Sections, Template Questions run in parallel; failing_table is whichever of those three rejects first (completion order can vary).',
  }
}

/** TEMPORARY: set by getTemplatesNested for /api/templates diagnostics. */
let lastTemplatesNestedFetchMeta = null
export function getLastTemplatesNestedFetchMeta() {
  return lastTemplatesNestedFetchMeta
}

// Airtable table names (override via env if needed). Export for API routes.
export const TABLES = {
  TEMPLATES: process.env.AIRTABLE_TEMPLATES_TABLE || 'Templates',
  SECTIONS: process.env.AIRTABLE_SECTIONS_TABLE || 'Template Sections',
  QUESTIONS: process.env.AIRTABLE_QUESTIONS_TABLE || 'Template Questions',
  GRADING: process.env.AIRTABLE_GRADING_TABLE || 'Grading Schemes',
  PEOPLE: process.env.AIRTABLE_PEOPLE_TABLE || 'People',
  USERS: process.env.AIRTABLE_USERS_TABLE || 'Users',
  INSPECTIONS: process.env.AIRTABLE_INSPECTIONS_TABLE || 'Inspections',
  INSPECTION_RESPONSES: process.env.AIRTABLE_INSPECTION_RESPONSES_TABLE || 'Inspection Responses',
  ACTIONS: process.env.AIRTABLE_ACTIONS_TABLE || 'Actions',
  BLOCKS: process.env.AIRTABLE_BLOCKS_TABLE || 'Blocks',
}

/**
 * Fetch records from Airtable (server-side)
 */
async function fetchAirtableRecords(tableName, options = {}) {
  const baseId = getAirtableBaseId()
  const apiKey = getAirtableKey()
  if (!baseId || !apiKey) {
    console.warn('Airtable credentials not configured.')
    console.warn('AIRTABLE_BASE_ID:', baseId ? 'Set' : 'Missing')
    console.warn('AIRTABLE_API_TOKEN (or AIRTABLE_API_KEY):', apiKey ? 'Set' : 'Missing')
    throw new Error('Airtable credentials not configured. Please set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY) environment variables.')
  }

  try {
    const params = new URLSearchParams()
    if (options.filterByFormula) {
      params.append('filterByFormula', options.filterByFormula)
    }
    if (options.view) {
      params.append('view', options.view)
    }
    if (options.sort) {
      options.sort.forEach((sort, index) => {
        params.append(`sort[${index}][field]`, sort.field)
        params.append(`sort[${index}][direction]`, sort.direction || 'asc')
      })
    }
    if (options.maxRecords) {
      params.append('maxRecords', options.maxRecords.toString())
    }

    const url = `${AIRTABLE_API_URL}/${baseId}/${tableName}?${params.toString()}`
    const qs = params.toString()
    console.log('[Airtable diag] fetch', {
      ...getAirtableDiagnosticsForLogging(),
      table: tableName,
      method: 'GET',
      path: `/v0/${maskBaseIdForLog(baseId)}/${encodeURIComponent(tableName)}`,
      queryStringLength: qs.length,
    })
    console.log(`[Airtable] Fetching from ${tableName}...`)
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      // Server-side: no caching for now
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Airtable diag] non-OK response (source: Airtable HTTP API, not Next.js)', {
        status: response.status,
        statusText: response.statusText,
        table: tableName,
        credential_used: getAirtableDiagnosticsForLogging().credential_chosen,
      })
      console.error(`[Airtable] API error: ${response.status} ${response.statusText}`, errorText)
      const err = new Error(`Airtable API error: ${response.status} ${response.statusText} - ${errorText}`)
      err.status = response.status
      err.statusCode = response.status
      err.airtableTableName = tableName
      err.airtableStatus = response.status
      err.response = { headers: { 'retry-after': response.headers.get('retry-after') } }
      throw err
    }

    const data = await response.json()
    console.log(`[Airtable] Fetched ${data.records.length} records from ${tableName}`)
    
    return data.records.map(record => ({
      id: record.id,
      ...record.fields
    }))
  } catch (error) {
    console.error(`[Airtable] Error fetching from ${tableName}:`, error)
    throw error
  }
}

/**
 * Create a single record in Airtable. Returns the new record id.
 * fields: object with Airtable field names; use arrays for linked records.
 */
export async function createAirtableRecord(tableName, fields) {
  const baseId = getAirtableBaseId()
  const apiKey = getAirtableKey()
  if (!baseId || !apiKey) {
    throw new Error('Airtable credentials not configured. Set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY).')
  }
  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Airtable create failed: ${response.status} ${response.statusText} - ${errText}`)
  }
  const data = await response.json()
  return data.id
}

/**
 * Update a single record in Airtable. recordId is the Airtable record id (e.g. recXXX).
 * fields: object with Airtable field names; use arrays for linked records.
 */
export async function updateAirtableRecord(tableName, recordId, fields) {
  const baseId = getAirtableBaseId()
  const apiKey = getAirtableKey()
  if (!baseId || !apiKey) {
    throw new Error('Airtable credentials not configured. Set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY).')
  }
  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Airtable update failed: ${response.status} ${response.statusText} - ${errText}`)
  }
  const data = await response.json()
  return data
}

/**
 * Fetch Users table record by Clerk User ID (for linking inspections to the submitting user).
 * Returns the first matching record or null. Record has .id for Airtable linking.
 */
export async function getAirtableUserByClerkId(clerkUserId) {
  if (!clerkUserId || typeof clerkUserId !== 'string' || !clerkUserId.trim()) return null
  const escaped = String(clerkUserId).replace(/\\/g, '\\\\').replace(/"/g, '""')
  const records = await fetchAirtableRecords(TABLES.USERS, {
    filterByFormula: `{Clerk User ID} = "${escaped}"`,
    maxRecords: 1,
  })
  return records[0] || null
}

/**
 * Fetch People records by exact email match (case-insensitive).
 * Returns array of records (each has id = Airtable record id for linking).
 */
export async function getPeopleByEmail(email) {
  if (!email || typeof email !== 'string' || !email.trim()) return []
  const trimmed = email.trim().toLowerCase()
  // Escape single quotes for Airtable formula: double them
  const escaped = trimmed.replace(/'/g, "''")
  const formula = `LOWER(TRIM({Email})) = '${escaped}'`
  return await fetchAirtableRecords(TABLES.PEOPLE, {
    filterByFormula: formula,
    maxRecords: 10,
  })
}

/**
 * Fetch all Blocks from Airtable (table: Blocks).
 * Primary label field is "Block Name" — never use "Name" (422 on this base). Do not pass sort[]=Name to the API.
 * Sorting is done in JS after fetch so the list request has no sort[] params that reference wrong field names.
 * Returns { id, name, estateId }. id = Airtable record ID.
 * Longer-term: sync Blocks into Postgres and read from Postgres for dropdowns to avoid rate limits.
 */
export async function getBlocks() {
  const records = await fetchAirtableRecords(TABLES.BLOCKS, {
    maxRecords: 500,
  })
  const mapped = records.map((r) => {
    const name =
      r['Block Name'] ??
      r['Block'] ??
      r['Title'] ??
      ''
    const estateLink = r['Estate'] ?? r['estate_id'] ?? r.estate
    const estateId = Array.isArray(estateLink) ? estateLink[0] : estateLink ?? null
    return {
      id: r.id,
      name: String(name || r.id),
      estateId: estateId ?? null,
    }
  })
  mapped.sort((a, b) => {
    const na = (a.name || '').toLowerCase()
    const nb = (b.name || '').toLowerCase()
    const c = na.localeCompare(nb)
    return c !== 0 ? c : a.id.localeCompare(b.id)
  })
  return mapped
}

/**
 * getBlocks with in-memory cache (60s) and 429 retry with backoff.
 * Use in server pages/API to avoid rate limits. Returns { id, name, estateId }[].
 */
export async function getBlocksCached() {
  const now = Date.now()
  if (blocksCache && blocksCache.expiresAt > now) {
    console.log('Blocks loaded (cached):', blocksCache.data.length)
    return blocksCache.data
  }
  const data = await with429Backoff(() => getBlocks(), 4)
  blocksCache = { data, expiresAt: now + 60_000 }
  console.log('Blocks loaded:', data.length)
  if (data.length === 0) {
    console.warn('[getBlocks] 0 blocks – check Airtable base/table/view/field names (Blocks, Block Name, Estate)')
  }
  return data
}

/**
 * Test function: Fetch first 5 records from Templates table
 * Logs the template_name field (or Name field) for each record
 */
export async function testAirtableConnection() {
  try {
    console.log('[Airtable Test] Starting connection test...')
    console.log('[Airtable Test] AIRTABLE_BASE_ID:', getAirtableBaseId() ? 'Set' : 'Missing')
    console.log('[Airtable Test] API key/token:', getAirtableKey() ? 'Set (hidden)' : 'Missing')
    
    const records = await fetchAirtableRecords(TABLES.TEMPLATES, {
      maxRecords: 5,
    })
    records.sort((a, b) =>
      (getTemplateName(a) || '').localeCompare(getTemplateName(b) || '', undefined, { sensitivity: 'base' })
    )
    
    console.log(`[Airtable Test] Successfully fetched ${records.length} template(s)`)
    
    records.forEach((record, index) => {
      // Try different possible field names
      const templateName = record['Name'] || record['Template Name'] || record['template_name'] || record.name || 'N/A'
      const recordId = record.id || 'N/A'
      
      console.log(`[Airtable Test] Template ${index + 1}:`)
      console.log(`  - Record ID: ${recordId}`)
      console.log(`  - Template Name: ${templateName}`)
      console.log(`  - All fields:`, Object.keys(record))
    })
    
    return {
      success: true,
      recordCount: records.length,
      records: records.map(record => ({
        id: record.id,
        name: record['Name'] || record['Template Name'] || record['template_name'] || record.name,
        allFields: Object.keys(record)
      }))
    }
  } catch (error) {
    console.error('[Airtable Test] Connection test failed:', error)
    return {
      success: false,
      error: error.message,
      details: error.toString()
    }
  }
}

// Resolve template name (try common Airtable field names; fallback to first text field or short id)
function getTemplateName(r) {
  const name =
    r['Template Name'] ??
    r['Name'] ??
    r['name'] ??
    r['Title'] ??
    r['Label'] ??
    r['Template Title'] ??
    ''
  if (name) return String(name).trim()
  // Fallback: first string field that looks like a name (not id or formula)
  for (const [key, val] of Object.entries(r)) {
    if (key === 'id' || key === 'Template' || key === 'Template ID') continue
    if (typeof val === 'string' && val.length > 0 && val.length < 200) return val.trim()
  }
  return ''
}
// Normalize question type. Airtable field is "Question Type". Values can be "yes_no", "yes_no,photo", "Yes/No", etc.
function normalizeQuestionType(v) {
  if (v == null || v === '') return 'text'
  const raw = String(v).toLowerCase().trim()
  if (raw.includes('yes_no')) return 'yes_no'
  if (/yes\s*[\/\-]?\s*no|yesno|yes\s+no/.test(raw)) return 'yes_no'
  if (raw.includes('yes') && raw.includes('no')) return 'yes_no'
  const s = raw.replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  return s === 'yesno' ? 'yes_no' : s
}

// Normalize "Comment/Photo required when" to 'on_no' | 'on_yes' | 'always' (else undefined)
function normalizeRequiredWhen(fieldValue, booleanFallback) {
  const v = fieldValue != null ? String(fieldValue).toLowerCase().trim().replace(/\s+/g, '_') : ''
  if (v === 'on_no' || v === 'on_yes' || v === 'always') return v
  if (booleanFallback === true) return 'on_no'
  return undefined
}

/** Airtable checkbox / single-select "Yes" — do not treat arbitrary strings (e.g. "No") as true. */
function airtableCheckboxYes(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0 || v === null || v === undefined) return false
  const s = String(v).trim().toLowerCase()
  if (!s) return false
  if (s === 'yes' || s === 'true' || s === '1' || s === 'y' || s === 'checked' || s === 'x') return true
  if (s === 'no' || s === 'false' || s === '0' || s === 'unchecked') return false
  return false
}

const INCLUDE_PHOTO_FIELD_KEYS = [
  'Include Photo',
  'Include photo',
  'include_photo',
  'Include photo?',
  'Include Photo?',
  'Photo checkbox',
  'photo_checkbox',
  'Show Photo',
  'show_photo',
  'Photo Upload',
  'photo_upload',
]

function questionIncludePhotoFromAirtable(q) {
  if (!q || typeof q !== 'object') return false
  for (const k of INCLUDE_PHOTO_FIELD_KEYS) {
    if (q[k] !== undefined && q[k] !== null && q[k] !== '' && airtableCheckboxYes(q[k])) return true
  }
  return false
}

// Resolve active flag (Is Active, is_active, Active)
function getTemplateActive(r) {
  if (r['is_active'] !== undefined) return !!r['is_active']
  if (r['Is Active'] !== undefined) return !!r['Is Active']
  if (r['Active'] !== undefined) return !!r['Active']
  return true
}

/**
 * Template Model
 */
export async function getTemplates() {
  const records = await fetchAirtableRecords(TABLES.TEMPLATES)
  return records
    .filter(r => getTemplateActive(r))
    .sort((a, b) => (getTemplateName(a) || '').localeCompare(getTemplateName(b) || ''))
}

export async function getTemplateById(templateId) {
  // Try to fetch by Record ID field first
  let templates = await fetchAirtableRecords(TABLES.TEMPLATES, {
    filterByFormula: `{Record ID} = "${templateId}"`
  })
  
  // If not found, try fetching all and matching by Airtable record ID
  if (templates.length === 0) {
    templates = await fetchAirtableRecords(TABLES.TEMPLATES)
    templates = templates.filter(t => t.id === templateId)
  }
  
  return templates.length > 0 ? normalizeTemplate(templates[0]) : null
}

// Parse options from Airtable (long text: one per line or comma-separated)
function parseOptions(val) {
  if (val == null || val === '') return []
  const s = String(val).trim()
  if (!s) return []
  const parts = s.split(/\r?\n|,/).map((p) => p.trim()).filter(Boolean)
  return parts
}

// Default grading options when scheme missing or no Options field
const DEFAULT_GRADING_OPTIONS = ['A', 'B', 'C', 'D', 'NA']

/** Linked Template Section record ids on a raw Airtable question row. */
function getLinkedSectionIdsFromRawQuestion(q) {
  if (!q || typeof q !== 'object') return []
  const link = q['Section'] ?? q.Section
  return Array.isArray(link) ? link : link ? [link] : []
}

/**
 * Text / number fields sometimes used instead of the Section link (e.g. "13" = 13th section by order).
 * When the Section link is set, callers should prefer that and ignore these for placement.
 */
function getQuestionSectionOrderOrIdText(q) {
  if (!q || typeof q !== 'object') return null
  const v =
    q['Section ID'] ??
    q['Section Id'] ??
    q.section_id ??
    q['Section Number'] ??
    q['Section number'] ??
    q['Section No'] ??
    q['Section no'] ??
    q['Section #'] ??
    q['Section index'] ??
    null
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

/**
 * Whether a raw Airtable question row belongs to a section (by link first, else Section ID = record id or section order).
 * @param {Record<string, unknown>} q
 * @param {string} sectionRecordId
 * @param {number} sectionSortOrder
 */
export function questionRawBelongsToTemplateSection(q, sectionRecordId, sectionSortOrder) {
  const linked = getLinkedSectionIdsFromRawQuestion(q)
  if (linked.length > 0) {
    return linked.includes(sectionRecordId)
  }
  const raw = getQuestionSectionOrderOrIdText(q)
  if (raw == null) return false
  if (raw === String(sectionRecordId).trim()) return true
  const n = Number(raw)
  const ord = Number(sectionSortOrder) || 0
  return Number.isFinite(n) && n > 0 && ord > 0 && n === ord
}

function sectionRecordBelongsToTemplate(s, templateId) {
  if (!s) return false
  const link = s['Template'] ?? s.Template
  const ids = Array.isArray(link) ? link : link ? [link] : []
  if (ids.includes(templateId)) return true
  const templateIdText = s['Template ID'] ?? s['Template Id'] ?? s.template_id
  return templateIdText != null && String(templateIdText).trim() === String(templateId).trim()
}

function mergeCostCodeOptionsFromAirtable(q, baseOptions) {
  const list =
    q['Cost Codes'] ??
    q['Cost codes'] ??
    q['cost_codes'] ??
    q['Cost code options'] ??
    q['costcode options'] ??
    q['Costcode options'] ??
    ''
  const extra = parseOptions(list)
  if (!extra.length) return baseOptions
  const out = [...(baseOptions || [])]
  const seen = new Set(
    out.map((o) => String(typeof o === 'string' ? o : (o?.value ?? o?.label ?? o ?? '')).trim()).filter(Boolean)
  )
  for (const c of extra) {
    const t = String(c).trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * Map one Airtable Questions table row to the nested template question shape (shared by section placement + orphan fix-up).
 * @param {Record<string, unknown>} q
 * @param {Record<string, unknown>} gradingSchemeMap
 * @param {string | null} [sectionIdForRow] — stored as `section_id` for flat merges / diagnostics
 */
export function mapAirtableQuestionRowToTemplateQuestion(q, gradingSchemeMap, sectionIdForRow = null) {
  const depLink = q['Depends On Question'] ?? q.depends_on_question
  const depId = Array.isArray(depLink) ? depLink[0] : depLink
  const gradingLink = q['Grading Scheme'] ?? q.grading_scheme
  const gradingId = Array.isArray(gradingLink) ? gradingLink[0] : gradingLink
  const optsRaw = q['Options'] ?? q.options
  let options = Array.isArray(optsRaw)
    ? optsRaw.map((o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? o)))
    : parseOptions(optsRaw)
  options = mergeCostCodeOptionsFromAirtable(q, options)
  const scheme = gradingId ? gradingSchemeMap[gradingId] : null
  const grading_options = scheme?.options ?? (gradingId ? DEFAULT_GRADING_OPTIONS : null)
  const grading_scheme_name = scheme?.name ?? null

  const rawType = String(q['Question Type'] ?? q.question_type ?? q.Type ?? '').trim()
  const includePhotoCheckbox = questionIncludePhotoFromAirtable(q)
  const commentWhen = normalizeRequiredWhen(
    q['Comment Required When'] ?? q.comment_required_when,
    q['Require Comment On No'] ?? q.require_comment_on_no
  )
  const photoWhen = normalizeRequiredWhen(
    q['Photo Required When'] ?? q.photo_required_when,
    q['Require Photo On No'] ?? q.require_photo_on_no
  )
  const inferredYesNo =
    (commentWhen === 'on_no' ||
      photoWhen === 'on_no' ||
      commentWhen === 'on_yes' ||
      photoWhen === 'on_yes') &&
    !rawType
  const normalizedType = normalizeQuestionType(rawType || (inferredYesNo ? 'yes_no' : 'text'))
  const questionKeyRaw = q['Question Key'] ?? q.question_key ?? q.Key ?? null
  const question_key =
    questionKeyRaw != null && String(questionKeyRaw).trim() !== '' ? String(questionKeyRaw).trim() : q.id
  return {
    id: q.id,
    question_key,
    question_text: q['Question Text'] ?? q.question_text ?? q.label ?? '',
    question_type: normalizedType,
    question_type_raw: rawType || null,
    include_photo: includePhotoCheckbox,
    type_includes_photo:
      includePhotoCheckbox ||
      rawType.toLowerCase().includes('photo') ||
      (normalizedType === 'yes_no' &&
        (photoWhen === 'always' || photoWhen === 'on_no' || photoWhen === 'on_yes')),
    sort_order: q['Question Order'] ?? q.question_order ?? q.sort_order ?? 0,
    options,
    is_required: !!(q['Is Required'] ?? q.is_required ?? q.required),
    depends_on_question_id: depId || null,
    show_when_value: q['Show When Value'] ?? q.show_when_value,
    create_action_on_no: (() => {
      const v = q['Create Action On No'] ?? q.create_action_on_no
      if (v === undefined || v === null) return true
      return !!v
    })(),
    action_category: q['Action Category'] ?? q.action_category ?? '',
    triggers_task: !!(q['Triggers Task'] ?? q.triggers_task),
    triggers_email: !!(q['Triggers Email'] ?? q.triggers_email),
    email_routing:
      (q['Email Routing'] ?? q.email_routing) && String(q['Email Routing'] ?? q.email_routing).trim()
        ? String(q['Email Routing'] ?? q.email_routing).trim()
        : null,
    email_route_team_id:
      (q['Email Route Team Id'] ?? q.email_route_team_id) &&
      String(q['Email Route Team Id'] ?? q.email_route_team_id).trim()
        ? String(q['Email Route Team Id'] ?? q.email_route_team_id).trim()
        : null,
    issue_type:
      (q['Issue Type'] ?? q.issue_type) && String(q['Issue Type'] ?? q.issue_type).trim()
        ? String(q['Issue Type'] ?? q.issue_type).trim()
        : null,
    programme_tag:
      (q['Programme Tag'] ?? q.programme_tag) && String(q['Programme Tag'] ?? q.programme_tag).trim()
        ? String(q['Programme Tag'] ?? q.programme_tag).trim()
        : null,
    category:
      (q['Category'] ?? q.category) && String(q['Category'] ?? q.category).trim()
        ? String(q['Category'] ?? q.category).trim()
        : (q['Action Category'] ?? q.action_category ?? ''),
    require_photo_on_no: !!(q['Require Photo On No'] ?? q.require_photo_on_no),
    require_comment_on_no: !!(q['Require Comment On No'] ?? q.require_comment_on_no),
    comment_required_when: commentWhen,
    photo_required_when: photoWhen,
    grading_scheme_id: gradingId || null,
    grading_scheme_name: grading_scheme_name || null,
    grading_options: grading_options || null,
    scoring_weight:
      q['Scoring Weight'] != null || q.scoring_weight != null ? Number(q['Scoring Weight'] ?? q.scoring_weight) : null,
    resident_wording:
      (q['Resident Wording'] ?? q.resident_wording) && String(q['Resident Wording'] ?? q.resident_wording).trim()
        ? String(q['Resident Wording'] ?? q.resident_wording).trim()
        : null,
    helper_text:
      (q['Helper Text'] ?? q.helper_text) && String(q['Helper Text'] ?? q.helper_text).trim()
        ? String(q['Helper Text'] ?? q.helper_text).trim()
        : null,
    instructions:
      (q['Instructions'] ?? q['Question Instructions'] ?? q.instructions) &&
      String(q['Instructions'] ?? q['Question Instructions'] ?? q.instructions).trim()
        ? String(q['Instructions'] ?? q['Question Instructions'] ?? q.instructions).trim()
        : null,
    ...(sectionIdForRow != null && String(sectionIdForRow).trim() !== ''
      ? { section_id: String(sectionIdForRow).trim() }
      : {}),
  }
}

/** If the same question id matched multiple sections (e.g. duplicate Section Order), keep the first section only. */
function dedupeQuestionsAcrossTemplateSections(sectionList) {
  if (!Array.isArray(sectionList)) return
  const claimed = new Set()
  for (const sec of sectionList) {
    const next = []
    for (const q of sec.questions || []) {
      if (!q?.id) continue
      if (claimed.has(q.id)) continue
      claimed.add(q.id)
      next.push(q)
    }
    sec.questions = next
  }
}

/**
 * Rows not placed in any section after the usual filter (e.g. Section link empty but Section ID = order number).
 */
function appendUnplacedQuestionsForTemplate(sectionList, questionRecords, templateId, sectionRecords, gradingSchemeMap) {
  if (!Array.isArray(sectionList) || sectionList.length === 0 || !Array.isArray(questionRecords)) return
  const placedIds = new Set()
  for (const sec of sectionList) {
    for (const q of sec.questions || []) {
      if (q?.id != null) placedIds.add(q.id)
    }
  }
  const templateSectionIds = new Set(sectionList.map((s) => s.id))

  const rawTargetsThisTemplate = (raw) => {
    const linked = getLinkedSectionIdsFromRawQuestion(raw)
    for (const sid of linked) {
      const sec = (sectionRecords || []).find((s) => s.id === sid)
      if (sec && sectionRecordBelongsToTemplate(sec, templateId)) return true
    }
    if (linked.length > 0) return false
    const hint = getQuestionSectionOrderOrIdText(raw)
    if (hint == null) return false
    const t = String(hint).trim()
    if (templateSectionIds.has(t)) return true
    const n = Number(t)
    if (Number.isFinite(n) && n > 0) {
      return sectionList.some((s) => (Number(s.sort_order) || 0) === n)
    }
    return false
  }

  for (const raw of questionRecords) {
    if (!raw?.id || placedIds.has(raw.id)) continue
    if (!rawTargetsThisTemplate(raw)) continue
    const targetSec = sectionList.find((sec) => questionRawBelongsToTemplateSection(raw, sec.id, sec.sort_order))
    if (!targetSec) continue
    if (!Array.isArray(targetSec.questions)) targetSec.questions = []
    targetSec.questions.push(mapAirtableQuestionRowToTemplateQuestion(raw, gradingSchemeMap, targetSec.id))
    placedIds.add(raw.id)
  }

  for (const sec of sectionList) {
    if (!Array.isArray(sec.questions)) continue
    sec.questions.sort(
      (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.id).localeCompare(String(b.id))
    )
  }
}

/**
 * Fetch all templates with nested sections and questions (for /api/templates).
 * Uses linked record fields: Template on sections, Section on questions.
 * Optionally fetches Grading Schemes to map grading_scheme_id -> options (A/B/C/D/NA).
 *
 * Ordering (do not rely on Airtable record order):
 * - Sections: sorted by Section Order (number, ascending); fallback field "Order".
 * - Questions: sorted by Question Order (number, ascending); fallback field "Order".
 */
export async function getTemplatesNested() {
  lastTemplatesNestedFetchMeta = {
    grading_table_name: TABLES.GRADING,
    grading_attempt: { outcome: 'pending', airtable_status_code: null },
    parallel_tables: [TABLES.TEMPLATES, TABLES.SECTIONS, TABLES.QUESTIONS],
  }
  console.log('[Airtable diag] getTemplatesNested table names (resolved)', {
    ...getAirtableDiagnosticsForLogging(),
    templatesTable: TABLES.TEMPLATES,
    sectionsTable: TABLES.SECTIONS,
    questionsTable: TABLES.QUESTIONS,
    gradingTable: TABLES.GRADING,
  })
  let gradingSchemeMap = {}
  try {
    const gradingRecords = await fetchAirtableRecords(TABLES.GRADING)
    lastTemplatesNestedFetchMeta.grading_attempt = { outcome: 'ok', airtable_status_code: null }
    gradingRecords.forEach((rec) => {
      const name = rec['Grading Type'] ?? rec['Name'] ?? rec['Grading Scheme'] ?? rec.name ?? ''
      const optsRaw = rec['Options'] ?? rec['Labels'] ?? rec['Grades'] ?? rec.options ?? ''
      const options = parseOptions(optsRaw)
      gradingSchemeMap[rec.id] = { name, options: options.length ? options : DEFAULT_GRADING_OPTIONS }
    })
  } catch (err) {
    const code = err.airtableStatus ?? err.statusCode ?? err.status ?? null
    lastTemplatesNestedFetchMeta.grading_attempt = { outcome: 'error', airtable_status_code: code }
    console.warn('[Airtable] Grading Schemes table not available:', err.message)
  }

  const [templateRecords, sectionRecords, questionRecords] = await Promise.all([
    fetchAirtableRecords(TABLES.TEMPLATES),
    fetchAirtableRecords(TABLES.SECTIONS),
    fetchAirtableRecords(TABLES.QUESTIONS),
  ])

  const templates = templateRecords
    .filter(r => getTemplateActive(r))
    .map(t => {
      const templateId = t.id
      const templateKey = t['template_key'] ?? t['Template Key'] ?? t.template_key ?? ''
      const name = getTemplateName(t)
      const templateType = String(t['Template Type'] ?? t.template_type ?? 'standard').trim() || 'standard'

      const sectionList = (sectionRecords || [])
        .filter(s => {
          const link = s['Template'] ?? s.Template
          const ids = Array.isArray(link) ? link : (link ? [link] : [])
          if (ids.includes(templateId)) return true
          const templateIdText = s['Template ID'] ?? s['Template Id'] ?? s.template_id
          return templateIdText != null && String(templateIdText).trim() === String(templateId).trim()
        })
        .sort((a, b) => {
          // Airtable ordering: Section Order (number, ascending). Do not rely on record order.
          const orderA = a['Section Order'] ?? a['Order'] ?? a.sort_order ?? 0
          const orderB = b['Section Order'] ?? b['Order'] ?? b.sort_order ?? 0
          return (Number(orderA) || 0) - (Number(orderB) || 0)
        })
        .map(s => {
          const sectionId = s.id
          const title = s['Section Title'] ?? s['section_title'] ?? s.title ?? s['Name'] ?? ''
          const sortOrder = s['Section Order'] ?? s['sort_order'] ?? s.sort_order ?? 0
          const trimSec = (v) =>
            v != null && String(v).trim() ? String(v).trim() : ''
          const helpText = trimSec(s['Help Text'] ?? s.help_text ?? s.helpText ?? '')
          const whatToLookFor = trimSec(
            s['What to Look For'] ??
              s['What to look for'] ??
              s['Instructions'] ??
              s['Section Instructions'] ??
              s.what_to_look_for ??
              ''
          )
          const isRepeatable = !!(s['Is Repeatable'] ?? s.is_repeatable ?? s.isRepeatable)

          const questions = (questionRecords || [])
            .filter((q) => questionRawBelongsToTemplateSection(q, sectionId, Number(sortOrder) || 0))
            .sort((a, b) => {
              // Airtable ordering: Question Order (number, ascending). Do not rely on record order.
              const orderA = a['Question Order'] ?? a['Order'] ?? a.question_order ?? a.sort_order ?? 0
              const orderB = b['Question Order'] ?? b['Order'] ?? b.question_order ?? b.sort_order ?? 0
              return (Number(orderA) || 0) - (Number(orderB) || 0)
            })
            .map((q) => mapAirtableQuestionRowToTemplateQuestion(q, gradingSchemeMap, sectionId))

          return {
            id: s.id,
            title,
            sort_order: Number(sortOrder) || 0,
            help_text: helpText || null,
            what_to_look_for: whatToLookFor || null,
            is_repeatable: isRepeatable,
            questions,
          }
        })

      dedupeQuestionsAcrossTemplateSections(sectionList)
      appendUnplacedQuestionsForTemplate(sectionList, questionRecords, templateId, sectionRecords, gradingSchemeMap)

      const flatQuestionsForTemplate = []
      for (const sec of sectionList) {
        for (const q of sec.questions || []) {
          if (q?.id != null) flatQuestionsForTemplate.push(q)
        }
      }

      return {
        id: t.id,
        template_key: templateKey,
        name,
        template_type: templateType,
        type: templateType,
        sections: sectionList,
        questions: flatQuestionsForTemplate,
      }
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  applyNeighbourhoodVoicePatchesToList(templates)
  const withCanonical = applyCaretakerCanonicalTemplates(templates)
  for (const t of withCanonical) {
    applyTemplateDisplayPatches(t)
  }
  return applyGroundsMaintenanceTemplateStructure(appendEstateWalkaboutTemplate(withCanonical))
}

/**
 * Whether this template is the Neighbourhood Voice (NV) template.
 * Use for wizard UX, resident wording, intro step, etc.
 */
export function isNeighbourhoodVoiceTemplate(template) {
  if (!template) return false
  const key = (template.template_key ?? template['Template Key'] ?? '').toString().toLowerCase().trim()
  const name = (template.name ?? '').toString().toLowerCase().trim()
  if (key === 'nv' || key === 'neighbourhood_voice' || key === 'neighbourhood voice') return true
  if (name.includes('neighbourhood voice') || name.includes('neighbourhood voices')) return true
  return false
}

/**
 * Section Model
 */
export async function getTemplateSections(templateId) {
  return await fetchAirtableRecords(TABLES.SECTIONS, {
    filterByFormula: `AND({Template ID} = "${templateId}", {Active} = TRUE())`,
    sort: [{ field: 'Order', direction: 'asc' }]
  })
}

export async function getSectionById(sectionId) {
  const sections = await fetchAirtableRecords(TABLES.SECTIONS, {
    filterByFormula: `{Record ID} = "${sectionId}"`
  })
  return sections[0] || null
}

/**
 * Question Model
 */
export async function getSectionQuestions(sectionId) {
  return await fetchAirtableRecords(TABLES.QUESTIONS, {
    filterByFormula: `AND({Section ID} = "${sectionId}", {Active} = TRUE())`,
    sort: [{ field: 'Order', direction: 'asc' }]
  })
}

export async function getQuestionById(questionId) {
  const questions = await fetchAirtableRecords(TABLES.QUESTIONS, {
    filterByFormula: `{Record ID} = "${questionId}"`
  })
  return questions[0] || null
}

/**
 * People Model (for recipient selection)
 */
export async function getPeople() {
  const rows = await fetchAirtableRecords(TABLES.PEOPLE, {
    filterByFormula: "{Active} = TRUE()",
  })
  const label = (r) =>
    r['Name'] ?? r['Full Name'] ?? r['Contact Name'] ?? r['Email'] ?? r.email ?? ''
  rows.sort((a, b) =>
    String(label(a)).localeCompare(String(label(b)), undefined, { sensitivity: 'base' })
  )
  return rows
}

export async function getPersonById(personId) {
  const people = await fetchAirtableRecords(TABLES.PEOPLE, {
    filterByFormula: `{Record ID} = "${personId}"`
  })
  return people[0] || null
}

/**
 * Get all questions for a template (across all sections)
 */
export async function getTemplateQuestions(templateId) {
  const sections = await getTemplateSections(templateId)
  const allQuestions = []
  
  for (const section of sections) {
    const questions = await getSectionQuestions(section.id)
    const sectionTitle =
      section['Section Title'] ??
      section['section_title'] ??
      section['Name'] ??
      section.title ??
      section.name ??
      ''
    allQuestions.push(
      ...questions.map((q) => ({
        ...q,
        section_id: section.id,
        section_name: sectionTitle,
      }))
    )
  }
  
  return allQuestions
}

/**
 * Normalize Airtable field names to our internal format
 */
export function normalizeQuestion(airtableQuestion) {
  const rawType = (airtableQuestion['Question Type'] || airtableQuestion.question_type || 'yesno').toString().trim()
  const questionType = normalizeQuestionType(rawType)
  return {
    id: airtableQuestion['Record ID'] || airtableQuestion.id,
    section_id: airtableQuestion['Section ID'] || airtableQuestion.section_id,
    label: airtableQuestion['Question Text'] || airtableQuestion.label,
    question_type: questionType,
    is_required: airtableQuestion['Required'] || airtableQuestion.is_required || false,
    depends_on_question_id: airtableQuestion['Depends On Question ID'] || airtableQuestion.depends_on_question_id,
    show_when_value: airtableQuestion['Show When Value'] !== undefined 
      ? airtableQuestion['Show When Value'] 
      : airtableQuestion.show_when_value,
    description: airtableQuestion['Description'] || airtableQuestion.description,
    options: airtableQuestion['Options'] || airtableQuestion.options || [],
    // Action creation fields
    action_category: airtableQuestion['Action Category'] || airtableQuestion.action_category,
    action_priority: airtableQuestion['Action Priority'] || airtableQuestion.action_priority,
    require_photo_on_no: airtableQuestion['Require Photo on No'] !== undefined 
      ? airtableQuestion['Require Photo on No'] 
      : (airtableQuestion.require_photo_on_no !== undefined ? airtableQuestion.require_photo_on_no : true),
    require_comment_on_no: airtableQuestion['Require Comment on No'] !== undefined 
      ? airtableQuestion['Require Comment on No'] 
      : (airtableQuestion.require_comment_on_no !== undefined ? airtableQuestion.require_comment_on_no : true),
    create_action_on_no: airtableQuestion['Create Action on No'] !== undefined 
      ? airtableQuestion['Create Action on No'] 
      : (airtableQuestion.create_action_on_no !== undefined ? airtableQuestion.create_action_on_no : true),
    order: airtableQuestion['Order'] || airtableQuestion.order || 0,
    // Per-question routing (triggersTask, triggersEmail, emailRouteTeamId, issueType, programmeTag)
    triggers_task: !!(airtableQuestion['Triggers Task'] ?? airtableQuestion.triggers_task),
    triggers_email: !!(airtableQuestion['Triggers Email'] ?? airtableQuestion.triggers_email),
    email_route_team_id: (airtableQuestion['Email Route Team Id'] ?? airtableQuestion.email_route_team_id) && String(airtableQuestion['Email Route Team Id'] ?? airtableQuestion.email_route_team_id).trim() ? String(airtableQuestion['Email Route Team Id'] ?? airtableQuestion.email_route_team_id).trim() : null,
    issue_type: (airtableQuestion['Issue Type'] ?? airtableQuestion.issue_type) && String(airtableQuestion['Issue Type'] ?? airtableQuestion.issue_type).trim() ? String(airtableQuestion['Issue Type'] ?? airtableQuestion.issue_type).trim() : null,
    programme_tag: (airtableQuestion['Programme Tag'] ?? airtableQuestion.programme_tag) && String(airtableQuestion['Programme Tag'] ?? airtableQuestion.programme_tag).trim() ? String(airtableQuestion['Programme Tag'] ?? airtableQuestion.programme_tag).trim() : null,
  }
}

export function normalizeSection(airtableSection) {
  return {
    id: airtableSection['Record ID'] || airtableSection.id,
    template_id: airtableSection['Template ID'] || airtableSection.template_id,
    name:
      airtableSection['Section Title'] ??
      airtableSection['section_title'] ??
      airtableSection['Name'] ??
      airtableSection.name,
    order: airtableSection['Order'] || airtableSection.order || 0,
    section_type: airtableSection['Section Type'] || airtableSection.section_type || 'standard'
  }
}

export function normalizeTemplate(airtableTemplate) {
  return {
    id: airtableTemplate['Record ID'] || airtableTemplate.id,
    name: airtableTemplate['Name'] || airtableTemplate.name,
    description: airtableTemplate['Description'] || airtableTemplate.description,
    template_type: airtableTemplate['Template Type'] || airtableTemplate.template_type || 'standard'
  }
}

export function normalizePerson(airtablePerson) {
  return {
    id: airtablePerson['Record ID'] || airtablePerson.id,
    airtable_id: airtablePerson.id,
    name: airtablePerson['Name'] || airtablePerson.name,
    email: airtablePerson['Email'] || airtablePerson.email,
    role: airtablePerson['Role'] || airtablePerson.role,
    category: airtablePerson['Category'] || airtablePerson.category,
    active: airtablePerson['Active'] !== undefined ? airtablePerson['Active'] : true
  }
}
