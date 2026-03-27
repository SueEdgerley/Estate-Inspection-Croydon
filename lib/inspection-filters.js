import { sql } from '@vercel/postgres'

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

export function joinSqlAnd(conditions = []) {
  if (!Array.isArray(conditions) || conditions.length === 0) return sql`TRUE`
  let out = conditions[0]
  for (let i = 1; i < conditions.length; i++) out = sql`${out} AND ${conditions[i]}`
  return out
}

/**
 * Shared inspection WHERE builder used by operational and analytics endpoints.
 * Keeps type/date/template/user/grading filtering consistent.
 */
export function buildInspectionWhereConditions({
  completionScope = 'completed',
  dateFrom = '',
  dateTo = '',
  dateField = null,
  type = 'all',
  template = 'all',
  inspector = 'all',
  scheduled = 'all',
  grading = 'all',
  locationSearch = '',
  admin = false,
  fallbackInspectorId = null,
}) {
  const where = []
  const scope = normalizeCompletionScope(completionScope, 'completed')

  if (scope === 'completed') {
    where.push(sql`status = 'submitted'`)
  } else if (scope === 'active') {
    where.push(sql`status IS DISTINCT FROM 'submitted'`)
  }

  if (!admin && fallbackInspectorId) {
    where.push(sql`inspector_id = ${fallbackInspectorId}`)
  }

  const dateCol =
    dateField === 'due_date'
      ? sql`due_date`
      : dateField === 'created_at'
        ? sql`created_at`
        : scope === 'completed'
          ? sql`submitted_at`
          : sql`COALESCE(submitted_at, created_at)`

  if (dateFrom) where.push(sql`${dateCol} >= ${dateFrom}`)
  if (dateTo) where.push(sql`${dateCol} <= ${dateTo + ' 23:59:59'}`)

  const normalizedType = normalizeInspectionTypeFilter(type)
  if (normalizedType !== 'all') where.push(sql`type = ${normalizedType}`)

  if (template && template !== 'all') where.push(sql`template_id = ${template}`)
  if (admin && inspector && inspector !== 'all') where.push(sql`inspector_id = ${inspector}`)

  if (scheduled && scheduled !== 'all') {
    if (scheduled === 'scheduled') where.push(sql`is_scheduled = true`)
    else where.push(sql`(is_scheduled = false OR is_scheduled IS NULL)`)
  }

  if (grading && grading !== 'all') {
    const g = String(grading).trim().toLowerCase()
    where.push(sql`lower(trim(coalesce(grading, ''))) = ${g}`)
  }

  if (locationSearch && String(locationSearch).trim()) {
    const q = `%${String(locationSearch).trim().toLowerCase()}%`
    where.push(sql`lower(coalesce(location_label, '')) LIKE ${q}`)
  }

  return where
}
