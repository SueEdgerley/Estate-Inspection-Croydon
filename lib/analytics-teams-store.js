/**
 * Current Analytics teams. Created at runtime so an empty team can be saved
 * before its staff list is known. Filtering uses this membership, not the
 * membership that existed when an inspection was submitted.
 */

const STAFF_JOB_TITLES = [
  'caretaker',
  'caretakers',
  'estate services manager',
  'estate service manager',
  'esm',
  'esms',
  'housing officer',
  'housing officers',
  'housing team manager',
  'housing team managers',
]

export async function ensureAnalyticsTeamsTables(run) {
  await run(
    `CREATE TABLE IF NOT EXISTS analytics_teams (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      manager_person_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    []
  )
  await run(
    `CREATE TABLE IF NOT EXISTS analytics_team_members (
      team_id VARCHAR(255) NOT NULL REFERENCES analytics_teams(id) ON DELETE CASCADE,
      person_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (team_id, person_id)
    )`,
    []
  )
}

export async function listAnalyticsTeams(run) {
  await ensureAnalyticsTeamsTables(run)
  const result = await run(
    `SELECT
       t.id,
       t.name,
       t.manager_person_id,
       COALESCE(NULLIF(trim(mgr.name), ''), NULLIF(trim(mgr.email), ''), '') AS manager_name,
       m.person_id,
       COALESCE(NULLIF(trim(p.name), ''), NULLIF(trim(p.email), ''), m.person_id) AS member_label,
       COALESCE(NULLIF(trim(p.email), ''), '') AS email,
       COALESCE(NULLIF(trim(p.airtable_id), ''), '') AS airtable_id,
       COALESCE(NULLIF(trim(u.email), ''), '') AS user_email,
       COALESCE(NULLIF(trim(u.clerk_user_id), ''), '') AS clerk_user_id,
       COALESCE(
         NULLIF(trim(u.email), ''),
         NULLIF(trim(p.email), ''),
         NULLIF(trim(u.clerk_user_id), ''),
         m.person_id
       ) AS inspector_value
     FROM analytics_teams t
     LEFT JOIN people mgr ON mgr.id = t.manager_person_id
     LEFT JOIN analytics_team_members m ON m.team_id = t.id
     LEFT JOIN people p ON p.id = m.person_id
     LEFT JOIN users u ON p.id IS NOT NULL AND (u.people_id = p.id OR lower(trim(u.email)) = lower(trim(p.email)))
     ORDER BY lower(t.name), t.id, member_label`,
    []
  )
  const byId = new Map()
  for (const row of result.rows || []) {
    let team = byId.get(row.id)
    if (!team) {
      team = {
        id: row.id,
        name: row.name,
        managerPersonId: row.manager_person_id || null,
        managerName: row.manager_name || null,
        members: [],
      }
      byId.set(row.id, team)
    }
    if (!row.person_id) continue
    const existing = team.members.find((member) => member.personId === row.person_id)
    if (existing) {
      existing.matchValues = [...new Set([...(existing.matchValues || []), ...matchValuesFromRow(row)])]
      continue
    }
    team.members.push({
      personId: row.person_id,
      label: row.member_label || row.person_id,
      email: row.email || null,
      value: row.inspector_value || row.email || row.person_id,
      airtableId: row.airtable_id || null,
      userEmail: row.user_email || null,
      clerkUserId: row.clerk_user_id || null,
      matchValues: matchValuesFromRow(row),
    })
  }
  return [...byId.values()]
}

function matchValuesFromRow(row) {
  return [row.person_id, row.email, row.airtable_id, row.user_email, row.clerk_user_id, row.inspector_value]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
}

export function normalizeTeamName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim()
  if (!name) {
    const error = new Error('Enter a team name.')
    error.status = 400
    throw error
  }
  if (name.length > 120) {
    const error = new Error('Team name must be 120 characters or fewer.')
    error.status = 400
    throw error
  }
  return name
}

export async function assertAnalyticsStaffIds(run, personIds) {
  const ids = [...new Set((personIds || []).map((value) => String(value || '').trim()).filter(Boolean))]
  if (!ids.length) return []
  const result = await run(
    `SELECT id
     FROM people
     WHERE id = ANY($1::text[])
       AND COALESCE(active, true) IS TRUE
       AND category IS DISTINCT FROM 'issue_recipient'
       AND lower(trim(COALESCE(job_title, role, ''))) = ANY($2::text[])`,
    [ids, STAFF_JOB_TITLES]
  )
  const found = new Set((result.rows || []).map((row) => row.id))
  if (ids.some((id) => !found.has(id))) {
    const error = new Error('Choose a manager and members from the existing staff list.')
    error.status = 400
    throw error
  }
  return ids
}

export async function createAnalyticsTeam(run, { name, managerPersonId = null } = {}) {
  await ensureAnalyticsTeamsTables(run)
  const teamName = normalizeTeamName(name)
  const managerId = managerPersonId ? (await assertAnalyticsStaffIds(run, [managerPersonId]))[0] : null
  const id = `team_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  await run(
    `INSERT INTO analytics_teams (id, name, manager_person_id)
     VALUES ($1, $2, $3)`,
    [id, teamName, managerId]
  )
  const teams = await listAnalyticsTeams(run)
  return teams.find((team) => team.id === id) || null
}

export async function updateAnalyticsTeam(run, teamId, { name, managerPersonId, memberPersonIds } = {}) {
  await ensureAnalyticsTeamsTables(run)
  const existing = await run(`SELECT id FROM analytics_teams WHERE id = $1`, [teamId])
  if (!existing.rows?.length) {
    const error = new Error('Team not found.')
    error.status = 404
    throw error
  }
  if (name != null) {
    const teamName = normalizeTeamName(name)
    await run(
      `UPDATE analytics_teams SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [teamId, teamName]
    )
  }
  if (managerPersonId !== undefined) {
    const managerId = managerPersonId ? (await assertAnalyticsStaffIds(run, [managerPersonId]))[0] : null
    await run(
      `UPDATE analytics_teams SET manager_person_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [teamId, managerId]
    )
  }
  if (Array.isArray(memberPersonIds)) {
    const ids = await assertAnalyticsStaffIds(run, memberPersonIds)
    for (const personId of ids) {
      await run(
        `INSERT INTO analytics_team_members (team_id, person_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [teamId, personId]
      )
    }
    if (ids.length) {
      await run(
        `DELETE FROM analytics_team_members WHERE team_id = $1 AND NOT (person_id = ANY($2::text[]))`,
        [teamId, ids]
      )
    } else {
      await run(`DELETE FROM analytics_team_members WHERE team_id = $1`, [teamId])
    }
    await run(`UPDATE analytics_teams SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [teamId])
  }
  const teams = await listAnalyticsTeams(run)
  return teams.find((team) => team.id === teamId) || null
}

export async function deleteAnalyticsTeam(run, teamId) {
  await ensureAnalyticsTeamsTables(run)
  const existing = await run(`SELECT id FROM analytics_teams WHERE id = $1`, [teamId])
  if (!existing.rows?.length) {
    const error = new Error('Team not found.')
    error.status = 404
    throw error
  }
  await run(`DELETE FROM analytics_teams WHERE id = $1`, [teamId])
}
