/**
 * Fragment builder matching @vercel/postgres `sql` placeholder rules, without executing.
 * Nested `sql\`...\`` fragments are NOT composable — interpolating them passes non-scalars
 * as bind values (→ `"{}"` / boolean cast errors). Use `fragment` + `joinSqlAnd` instead.
 */
export function fragment(strings, ...values) {
  let result = strings[0] ?? ''
  for (let i = 1; i < strings.length; i++) {
    result += `$${i}${strings[i] ?? ''}`
  }
  return [result, values]
}

function sanitizeUrlScalar(v, fallback = '') {
  if (v == null || v === '') return fallback
  const s = String(v).trim()
  if (s === '{}' || s === '[object Object]') return fallback
  return s
}

const TYPE_ALIAS_TO_DB = {
  estate: 'estate_walkabout',
}

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
}

export function normalizeInspectionTypeFilter(v) {
  const n = norm(v)
  if (!n || n === 'all') return 'all'
  return TYPE_ALIAS_TO_DB[n] || n
}

export function normalizeCompletionScope(v, fallback = 'completed') {
  const n = norm(v)
  if (n === 'active' || n === 'completed' || n === 'all') return n
  return fallback
}

/**
 * Merge [text, params][] with AND; renumber $1..$n across fragments.
 *
 * Returns a plain tuple — do NOT pass this into @vercel/postgres `sql`...`${tuple}`; that binds the
 * whole array as one parameter (boolean/json errors). Use `neon(queryString, params)` / `getNeonQuery()(query, params)`.
 *
 * @returns {[string, unknown[]]}
 */
export function joinSqlAnd(conditions = []) {
  if (!Array.isArray(conditions) || conditions.length === 0) return ['TRUE', []]
  let mergedText = ''
  const mergedValues = []
  let offset = 0
  for (let i = 0; i < conditions.length; i++) {
    const row = conditions[i]
    if (!Array.isArray(row) || row.length < 2 || typeof row[0] !== 'string') {
      throw new Error(
        '[joinSqlAnd] each condition must be a [sqlText, params] tuple from fragment`...` — do not pass sql`...` Promises or raw objects'
      )
    }
    const [t, v] = row
    const vals = Array.isArray(v) ? v : []
    const renumbered = t.replace(/\$(\d+)/g, (_, n) => `$${offset + parseInt(n, 10)}`)
    mergedText += (i > 0 ? ' AND ' : '') + `(${renumbered})`
    mergedValues.push(...vals)
    offset += vals.length
  }
  return [mergedText, mergedValues]
}

/**
 * Shared inspection WHERE builder used by operational and analytics endpoints.
 * Keeps type/date/template/user/grading filtering consistent.
 */
export function buildInspectionWhereConditions({
  completionScope = 'completed',
  inspectionStatus = '',
  dateFrom = '',
  dateTo = '',
  dateField = null,
  type = 'all',
  template = 'all',
  templateName = '',
  workType = 'all',
  role = 'all',
  estateId = '',
  blockId = '',
  estateArea = '',
  inspector = 'all',
  scheduled = 'all',
  grading = 'all',
  locationSearch = '',
  admin = false,
  fallbackInspectorId = null,
}) {
  const adminFlag = admin === true

  const where = []
  const scope = normalizeCompletionScope(sanitizeUrlScalar(completionScope, 'completed'), 'completed')

  const iraw = sanitizeUrlScalar(inspectionStatus, '')
  const inorm = norm(iraw)
  /** @type {'all' | 'submitted' | 'draft' | null} */
  let explicitInspectionStatus = null
  if (inorm === 'all' || inorm === 'any') explicitInspectionStatus = 'all'
  else if (inorm === 'submitted') explicitInspectionStatus = 'submitted'
  else if (inorm === 'draft' || inorm === 'active' || inorm === 'not_submitted') {
    explicitInspectionStatus = 'draft'
  }

  if (explicitInspectionStatus === 'all') {
    // no status predicate
  } else if (explicitInspectionStatus === 'submitted') {
    where.push(fragment`(submitted_at IS NOT NULL OR lower(trim(COALESCE(status, ''))) = 'submitted')`)
  } else if (explicitInspectionStatus === 'draft') {
    where.push(fragment`submitted_at IS NULL AND lower(COALESCE(status, '')) NOT IN ('submitted', 'completed', 'complete')`)
  } else if (scope === 'completed') {
    where.push(fragment`(submitted_at IS NOT NULL OR lower(COALESCE(status, '')) IN ('submitted', 'completed', 'complete'))`)
  } else if (scope === 'active') {
    where.push(fragment`submitted_at IS NULL AND lower(COALESCE(status, '')) NOT IN ('submitted', 'completed', 'complete')`)
  }

  if (!adminFlag && fallbackInspectorId) {
    where.push(fragment`inspector_id = ${fallbackInspectorId}`)
  }

  const dateToEnd = dateTo ? `${dateTo} 23:59:59` : ''
  const dfRaw = dateField != null ? sanitizeUrlScalar(dateField, '') : ''
  const dateFieldNorm = dfRaw || null
  const dateFromS = sanitizeUrlScalar(dateFrom, '')
  const dateToS = sanitizeUrlScalar(dateTo, '')

  const effectiveSubmittedOnly =
    explicitInspectionStatus === 'submitted' ||
    (explicitInspectionStatus === null && scope === 'completed')

  if (dateFromS || dateToS) {
    if (dateFieldNorm === 'due_date') {
      if (dateFromS) where.push(fragment`due_date >= ${dateFromS}`)
      if (dateToS) where.push(fragment`due_date <= ${dateToEnd}`)
    } else if (dateFieldNorm === 'created_at') {
      if (dateFromS) where.push(fragment`created_at >= ${dateFromS}`)
      if (dateToS) where.push(fragment`created_at <= ${dateToEnd}`)
    } else if (effectiveSubmittedOnly) {
      if (dateFromS) where.push(fragment`submitted_at >= ${dateFromS}`)
      if (dateToS) where.push(fragment`submitted_at <= ${dateToEnd}`)
    } else {
      if (dateFromS) where.push(fragment`COALESCE(submitted_at, created_at) >= ${dateFromS}`)
      if (dateToS) where.push(fragment`COALESCE(submitted_at, created_at) <= ${dateToEnd}`)
    }
  }

  const normalizedType = normalizeInspectionTypeFilter(sanitizeUrlScalar(type, 'all'))
  if (normalizedType !== 'all') where.push(fragment`type = ${normalizedType}`)

  const templateNameS = sanitizeUrlScalar(templateName, '')
  if (templateNameS && templateNameS !== 'all') {
    where.push(fragment`trim(coalesce(template_name, '')) = ${templateNameS.trim()}`)
  }

  const templateS = sanitizeUrlScalar(template, 'all')
  if (templateS && templateS !== 'all') where.push(fragment`template_id = ${templateS}`)

  const workTypeS = norm(sanitizeUrlScalar(workType, 'all'))
  const roleS = norm(sanitizeUrlScalar(role, 'all'))
  const effectiveWorkType =
    workTypeS !== 'all'
      ? workTypeS
      : roleS === 'caretaker'
        ? 'caretaker_scheduled'
        : roleS === 'esm'
          ? 'esm_adhoc'
          : roleS === 'housing_officer' || roleS === 'housing_team_manager'
            ? 'housing_walkabout'
            : 'all'
  if (effectiveWorkType !== 'all') where.push(fragment`work_type = ${effectiveWorkType}`)

  const inspectorS = sanitizeUrlScalar(inspector, 'all')
  if (adminFlag && inspectorS && inspectorS !== 'all') {
    where.push(fragment`lower(trim(coalesce(inspector_id, ''))) = lower(trim(${inspectorS}))`)
  }

  const estateIdS = sanitizeUrlScalar(estateId, '')
  if (estateIdS && estateIdS !== 'all') where.push(fragment`estate_id = ${estateIdS}`)

  const blockIdS = sanitizeUrlScalar(blockId, '')
  if (blockIdS && blockIdS !== 'all') where.push(fragment`block_id = ${blockIdS}`)

  const estateAreaS = sanitizeUrlScalar(estateArea, '')
  if (estateAreaS && estateAreaS !== 'all') {
    where.push(
      fragment`estate_id IN (
        SELECT id FROM estates
        WHERE lower(trim(coalesce(area, ''))) = lower(trim(${estateAreaS.trim()}))
      )`
    )
  }

  const scheduledS = sanitizeUrlScalar(scheduled, 'all')
  if (scheduledS && scheduledS !== 'all') {
    if (scheduledS === 'scheduled') where.push(fragment`is_scheduled = true`)
    else where.push(fragment`(is_scheduled = false OR is_scheduled IS NULL)`)
  }

  const gradingS = sanitizeUrlScalar(grading, 'all')
  if (gradingS && gradingS !== 'all') {
    const g = String(gradingS).trim().toLowerCase()
    where.push(fragment`lower(trim(coalesce(grading, ''))) = ${g}`)
  }

  const loc = sanitizeUrlScalar(locationSearch, '')
  if (loc && String(loc).trim()) {
    const q = `%${String(loc).trim().toLowerCase()}%`
    where.push(fragment`lower(coalesce(location_label, '')) LIKE ${q}`)
  }

  return where
}

/** Inspections table columns referenced in `buildInspectionWhereConditions` fragments (unaliased). */
const INSPECTION_COLUMNS_TO_ALIAS = [
  'status',
  'submitted_at',
  'created_at',
  'due_date',
  'type',
  'template_id',
  'template_name',
  'work_type',
  'inspector_id',
  'estate_id',
  'block_id',
  'is_scheduled',
  'grading',
  'location_label',
]

/**
 * Prefix inspection columns for queries that use table alias `i` (JOIN estates/blocks).
 * @param {string} sqlText
 * @param {string} [alias='i']
 */
export function aliasInspectionWhereClause(sqlText, alias = 'i') {
  let out = sqlText
  for (const col of INSPECTION_COLUMNS_TO_ALIAS) {
    out = out.replace(new RegExp(`\\b${col}\\b`, 'g'), `${alias}.${col}`)
  }
  return out
}
