/**
 * Shared helpers for issue/action recipient dropdowns (category = issue_recipient, active = true).
 * Used by form components and GET /api/people when purpose=issue_recipient is requested.
 */

export const ISSUE_RECIPIENT_PEOPLE_QUERY = 'purpose=issue_recipient&active=true'

export function issueRecipientPeopleApiUrl(issueCategory = '') {
  const params = new URLSearchParams({ purpose: 'issue_recipient', active: 'true' })
  if (issueCategory) params.set('issue_category', String(issueCategory).trim())
  return `/api/people?${params.toString()}`
}

/**
 * @param {URLSearchParams | { get: (key: string) => string | null }} searchParams
 */
export function isIssueRecipientPeopleRequest(searchParams) {
  const purpose = String(searchParams.get('purpose') || '')
    .trim()
    .toLowerCase()
  const scope = String(searchParams.get('scope') || '')
    .trim()
    .toLowerCase()
  const category = String(searchParams.get('category') || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  const active = String(searchParams.get('active') || '')
    .trim()
    .toLowerCase()
  if (purpose === 'issue_recipient') return true
  if (scope === 'issue_recipients' || scope === 'issue_recipient') return true
  if (category === 'issue_recipient' && (active === 'true' || active === '1' || active === '')) return true
  return false
}

export function isStrictIssueRecipientRow(row) {
  if (!row || row.active === false) return false
  const category = String(row.category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  return category === 'issue_recipient'
}

export function mapIssueRecipientPeopleToOptions(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(isStrictIssueRecipientRow)
    .map((p) => ({
      value: p.id != null ? String(p.id) : '',
      label: p.name ? `${p.name}${p.email ? ` (${p.email})` : ''}` : p.email || String(p.id ?? ''),
      issue_categories: Array.isArray(p.issue_categories) ? p.issue_categories : [],
      issue_recipient: true,
      recipient_source: p.recipient_source || 'people',
      category: p.category || '',
      role: p.role || '',
      job_title: p.job_title || '',
      email: p.email || '',
      name: p.name || '',
    }))
    .filter((x) => x.value && x.label && !x.value.includes('@'))
}

/**
 * Client-side fetch for issue recipient dropdown options.
 * @param {typeof fetch} [fetchFn]
 * @param {{ issueCategory?: string, credentials?: RequestCredentials, cache?: RequestCache }} [options]
 */
export async function loadIssueRecipientPeople(fetchFn = fetch, options = {}) {
  const { issueCategory = '', credentials = 'include', cache = 'no-store' } = options
  const url = issueRecipientPeopleApiUrl(issueCategory)
  const res = await fetchFn(url, { cache, credentials })
  if (!res.ok) return []
  const rows = await res.json().catch(() => [])
  if (!Array.isArray(rows)) return []
  return mapIssueRecipientPeopleToOptions(rows)
}
