/**
 * Resolve a person for an issue using issue_routing_rules then people.role / direct id.
 * @param {import('@vercel/postgres').Sql} sql
 * @param {{ issueCategory: string, issueType?: string | null, estateId?: string | null, assignToRoleFallback?: string | null }} params
 * @returns {Promise<{ personId: string, email: string, name: string } | null>}
 */
export async function resolveIssueRoutingRecipient(sql, params) {
  const { issueCategory, issueType, estateId, assignToRoleFallback } = params
  if (!issueCategory) return null

  const rulesRes = await sql`
    SELECT id, issue_category, issue_type, estate_id, assign_to_role, assign_to_person_id
    FROM issue_routing_rules
    WHERE active = true
      AND issue_category = ${issueCategory}
  `
  const all = rulesRes.rows || []
  const globalRules = all.filter((r) => !r.estate_id)
  const estateRules = estateId ? all.filter((r) => r.estate_id === estateId) : []
  const pool = estateRules.length ? estateRules : globalRules

  let rule =
    (issueType && pool.find((r) => r.issue_type === issueType)) ||
    pool.find((r) => !r.issue_type) ||
    pool[0]

  if (rule?.assign_to_person_id) {
    const pRes = await sql`
      SELECT id, email, name FROM people
      WHERE id = ${rule.assign_to_person_id}
        AND COALESCE(active, true) = true
      LIMIT 1
    `
    const p = pRes.rows[0]
    if (p?.email) return { personId: p.id, email: p.email, name: p.name }
  }

  const role = rule?.assign_to_role || assignToRoleFallback
  if (!role) return null

  const byRole = await sql`
    SELECT id, email, name FROM people
    WHERE role = ${role}
      AND COALESCE(active, true) = true
    ORDER BY created_at ASC
    LIMIT 1
  `
  const pr = byRole.rows[0]
  if (pr?.email) return { personId: pr.id, email: pr.email, name: pr.name }
  return null
}
