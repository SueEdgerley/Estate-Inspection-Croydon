/**
 * Analytics team filter. Membership is the current staff list, including when
 * the selected period is in the past. Access limits which teams and staff are
 * offered before this filter is applied.
 */

export const ALL_TEAMS = 'all'

export const EMPTY_TEAM_MESSAGE = 'This team has no members yet, so there are no inspections to show.'

export const UNAVAILABLE_TEAM_MESSAGE = 'That team is not available, so no inspections are shown.'

export function normalizeTeamSelection(value) {
  const team = String(value || '').trim()
  if (!team || team.toLowerCase() === ALL_TEAMS) return ALL_TEAMS
  return team
}

function pushMatchValue(set, value) {
  const next = String(value || '').trim().toLowerCase()
  if (next) set.add(next)
}

/** Identifiers that may be stored on inspections.inspector_id for this member. */
export function memberMatchValues(member) {
  const set = new Set()
  if (!member) return []
  pushMatchValue(set, member.value)
  pushMatchValue(set, member.email)
  pushMatchValue(set, member.personId)
  pushMatchValue(set, member.person_id)
  pushMatchValue(set, member.airtableId)
  pushMatchValue(set, member.airtable_id)
  pushMatchValue(set, member.userEmail)
  pushMatchValue(set, member.user_email)
  pushMatchValue(set, member.clerkUserId)
  pushMatchValue(set, member.clerk_user_id)
  for (const extra of member.matchValues || []) pushMatchValue(set, extra)
  return [...set]
}

export function teamInspectorMatchValues(team) {
  const set = new Set()
  for (const member of team?.members || []) {
    for (const value of memberMatchValues(member)) set.add(value)
  }
  return [...set]
}

export function publicAnalyticsTeam(team) {
  const members = (team?.members || []).map((member) => ({
    personId: member.personId || member.person_id || '',
    label: member.label || member.email || member.personId || 'Staff',
    value: member.value || member.email || member.personId || member.person_id || '',
    email: member.email || null,
  }))
  return {
    id: team.id,
    name: team.name,
    managerPersonId: team.managerPersonId || team.manager_person_id || null,
    managerName: team.managerName || team.manager_name || null,
    memberCount: members.length,
    empty: members.length === 0,
    members,
  }
}

export function teamsVisibleToViewer(teams, { seeAll = false, allowedPersonIds = [], allowedValues = [] } = {}) {
  const rows = Array.isArray(teams) ? teams : []
  if (seeAll) return rows
  const ids = new Set((allowedPersonIds || []).map((value) => String(value || '').trim()).filter(Boolean))
  const values = new Set((allowedValues || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
  return rows.filter((team) =>
    (team.members || []).some((member) => {
      const personId = member.personId || member.person_id
      if (personId && ids.has(personId)) return true
      return memberMatchValues(member).some((value) => values.has(value))
    })
  )
}

export function staffVisibleToViewer(people, { seeAll = false, allowedPersonIds = [], allowedValues = [] } = {}) {
  const rows = Array.isArray(people) ? people : []
  if (seeAll) return rows
  const ids = new Set((allowedPersonIds || []).map((value) => String(value || '').trim()).filter(Boolean))
  const values = new Set((allowedValues || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
  return rows.filter((person) => {
    if (person?.personId && ids.has(person.personId)) return true
    const value = String(person?.value || '').trim().toLowerCase()
    const email = String(person?.email || '').trim().toLowerCase()
    return (value && values.has(value)) || (email && values.has(email))
  })
}

/**
 * @returns {{
 *   selectedTeamId: string | null,
 *   selectedTeam: object | null,
 *   inspectorMatchValues: string[] | null,
 *   emptyTeam: boolean,
 *   unavailableTeam: boolean,
 *   visibleTeams: object[],
 *   message: string | null,
 * }}
 */
export function resolveAnalyticsTeamFilter({
  teamId,
  teams,
  seeAll = false,
  allowedPersonIds = [],
  allowedValues = [],
} = {}) {
  const visibleTeams = teamsVisibleToViewer(teams, { seeAll, allowedPersonIds, allowedValues })
  const selection = normalizeTeamSelection(teamId)
  if (selection === ALL_TEAMS) {
    return {
      selectedTeamId: null,
      selectedTeam: null,
      inspectorMatchValues: null,
      emptyTeam: false,
      unavailableTeam: false,
      visibleTeams,
      message: null,
    }
  }
  const selectedTeam = visibleTeams.find((team) => team.id === selection) || null
  if (!selectedTeam) {
    return {
      selectedTeamId: selection,
      selectedTeam: null,
      inspectorMatchValues: [],
      emptyTeam: false,
      unavailableTeam: true,
      visibleTeams,
      message: UNAVAILABLE_TEAM_MESSAGE,
    }
  }
  const inspectorMatchValues = teamInspectorMatchValues(selectedTeam)
  const emptyTeam = inspectorMatchValues.length === 0
  return {
    selectedTeamId: selectedTeam.id,
    selectedTeam,
    inspectorMatchValues,
    emptyTeam,
    unavailableTeam: false,
    visibleTeams,
    message: emptyTeam ? EMPTY_TEAM_MESSAGE : null,
  }
}

export function filterPeopleForTeam(people, teamId, teams) {
  const rows = Array.isArray(people) ? people : []
  const selection = normalizeTeamSelection(teamId)
  if (selection === ALL_TEAMS) return rows
  const team = (teams || []).find((row) => row.id === selection)
  if (!team) return []
  const ids = new Set((team.members || []).map((member) => member.personId || member.person_id).filter(Boolean))
  const values = new Set((team.members || []).flatMap((member) => memberMatchValues(member)))
  return rows.filter((person) => {
    if (person?.personId && ids.has(person.personId)) return true
    const value = String(person?.value || '').trim().toLowerCase()
    return value && values.has(value)
  })
}

export function reconcilePersonAfterTeamChange(nextTeamId, currentPerson, people, teams) {
  if (!currentPerson || currentPerson === 'all') return 'all'
  if (normalizeTeamSelection(nextTeamId) === ALL_TEAMS) return currentPerson
  const options = filterPeopleForTeam(people, nextTeamId, teams)
  return options.some((person) => person.value === currentPerson) ? currentPerson : 'all'
}

export function inspectionMatchesTeam(inspection, team) {
  const values = teamInspectorMatchValues(team)
  if (!values.length) return false
  const inspectorId = String(inspection?.inspectorId || inspection?.inspector_id || '').trim().toLowerCase()
  return values.includes(inspectorId)
}

/** Distinct blocks inspected by the team's current members. */
export function inspectedBlockIdsForTeam(inspections, team) {
  const ids = []
  const seen = new Set()
  for (const inspection of inspections || []) {
    if (!inspectionMatchesTeam(inspection, team)) continue
    const blockId = inspection?.blockId || inspection?.block_id
    if (!blockId || seen.has(blockId)) continue
    seen.add(blockId)
    ids.push(String(blockId))
  }
  return ids
}
