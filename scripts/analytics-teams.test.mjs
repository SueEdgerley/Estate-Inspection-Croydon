/**
 * Analytics team filter: default view, empty teams, inspector changes, and one block per team.
 * Run: node --test scripts/analytics-teams.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalyticsQueryString } from '../lib/analytics-client-filters.js'
import { buildAnalyticsFilterArgs } from '../lib/analytics-filters.js'
import { buildInspectionWhereConditions, joinSqlAnd } from '../lib/inspection-filters.js'
import {
  EMPTY_TEAM_MESSAGE,
  filterPeopleForTeam,
  inspectedBlockIdsForTeam,
  inspectionMatchesTeam,
  reconcilePersonAfterTeamChange,
  resolveAnalyticsTeamFilter,
  staffVisibleToViewer,
  teamsVisibleToViewer,
} from '../lib/analytics-teams.js'

const PEOPLE = [
  { personId: 'p1', value: 'a@croydon.gov.uk', email: 'a@croydon.gov.uk', label: 'Alex', role: 'caretaker' },
  { personId: 'p2', value: 'b@croydon.gov.uk', email: 'b@croydon.gov.uk', label: 'Blake', role: 'caretaker' },
  { personId: 'p3', value: 'c@croydon.gov.uk', email: 'c@croydon.gov.uk', label: 'Casey', role: 'esm' },
]

const NORTH = {
  id: 'team-north',
  name: 'North',
  managerPersonId: 'p3',
  members: [
    { personId: 'p1', value: 'a@croydon.gov.uk', email: 'a@croydon.gov.uk' },
    { personId: 'p2', value: 'b@croydon.gov.uk', email: 'b@croydon.gov.uk' },
  ],
}

const EMPTY = {
  id: 'team-empty',
  name: 'Unassigned',
  members: [],
}

describe('default team filter', () => {
  it('All teams sends no team parameter and does not add a team predicate', () => {
    const qs = buildAnalyticsQueryString({
      preset: 'custom',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
      team: 'all',
      person: 'all',
      gradeTemplateName: 'Grounds Maintenance',
    })
    assert.doesNotMatch(qs, /(?:^|&)team=/)
    assert.match(qs, /gradeTemplateName=/)

    const resolved = resolveAnalyticsTeamFilter({ teamId: 'all', teams: [NORTH, EMPTY], seeAll: true })
    assert.equal(resolved.inspectorMatchValues, null)
    assert.equal(resolved.message, null)
    assert.equal(resolved.visibleTeams.length, 2)

    const args = buildAnalyticsFilterArgs(
      new URLSearchParams(qs),
      true,
      null,
      { inspectorMatchValues: resolved.inspectorMatchValues }
    )
    const [sql] = joinSqlAnd(buildInspectionWhereConditions(args))
    assert.match(sql, /submitted_at/)
    assert.match(sql, /template_name/)
    assert.doesNotMatch(sql, /ANY\(/)
    assert.doesNotMatch(sql, /FALSE/)
  })
})

describe('empty team', () => {
  it('matches nobody and explains that there are no inspections', () => {
    const resolved = resolveAnalyticsTeamFilter({ teamId: EMPTY.id, teams: [EMPTY, NORTH], seeAll: true })
    assert.equal(resolved.emptyTeam, true)
    assert.deepEqual(resolved.inspectorMatchValues, [])
    assert.equal(resolved.message, EMPTY_TEAM_MESSAGE)
    assert.deepEqual(filterPeopleForTeam(PEOPLE, EMPTY.id, [EMPTY, NORTH]), [])

    const args = buildAnalyticsFilterArgs(new URLSearchParams('preset=quarter'), true, null, {
      inspectorMatchValues: resolved.inspectorMatchValues,
    })
    const [sql] = joinSqlAnd(buildInspectionWhereConditions(args))
    assert.match(sql, /FALSE/)
  })
})

describe('switching teams', () => {
  it('keeps an inspector who belongs to the new team and clears one who does not', () => {
    const south = {
      id: 'team-south',
      name: 'South',
      members: [{ personId: 'p2', value: 'b@croydon.gov.uk', email: 'b@croydon.gov.uk' }],
    }
    const teams = [NORTH, south]
    assert.equal(reconcilePersonAfterTeamChange('team-south', 'a@croydon.gov.uk', PEOPLE, teams), 'all')
    assert.equal(reconcilePersonAfterTeamChange('team-north', 'a@croydon.gov.uk', PEOPLE, teams), 'a@croydon.gov.uk')
    assert.equal(reconcilePersonAfterTeamChange('all', 'a@croydon.gov.uk', PEOPLE, teams), 'a@croydon.gov.uk')
    assert.deepEqual(
      filterPeopleForTeam(PEOPLE, 'team-north', teams).map((person) => person.personId),
      ['p1', 'p2']
    )
  })
})

describe('two team members inspecting one block', () => {
  it('counts the block once and uses the caretaker’s current team for an earlier inspection', () => {
    const inspections = [
      { id: 'old', blockId: 'blk-1', inspectorId: 'a@croydon.gov.uk', submittedAt: '2024-01-15' },
      { id: 'new', blockId: 'blk-1', inspectorId: 'b@croydon.gov.uk', submittedAt: '2026-06-02' },
      { id: 'other-team', blockId: 'blk-1', inspectorId: 'c@croydon.gov.uk', submittedAt: '2026-06-02' },
    ]
    assert.equal(inspectionMatchesTeam(inspections[0], NORTH), true)
    assert.deepEqual(inspectedBlockIdsForTeam(inspections, NORTH), ['blk-1'])

    const afterMove = {
      id: 'team-south',
      name: 'South',
      members: [{ personId: 'p1', value: 'a@croydon.gov.uk', email: 'a@croydon.gov.uk' }],
    }
    assert.equal(inspectionMatchesTeam(inspections[0], afterMove), true)
    assert.equal(inspectionMatchesTeam(inspections[0], { ...NORTH, members: NORTH.members.filter((m) => m.personId !== 'p1') }), false)

    const args = buildAnalyticsFilterArgs(
      new URLSearchParams('preset=custom&dateFrom=2026-06-01&dateTo=2026-06-30&gradeTemplateName=Caretaker&person=a@croydon.gov.uk'),
      true,
      null,
      { inspectorMatchValues: ['a@croydon.gov.uk', 'b@croydon.gov.uk'] }
    )
    const [sql] = joinSqlAnd(buildInspectionWhereConditions(args))
    assert.match(sql, /submitted_at/)
    assert.match(sql, /template_name/)
    assert.match(sql, /inspector_id/)
    assert.match(sql, /ANY\(/)
  })
})

describe('team access', () => {
  it('offers every team to an admin and only the viewer’s teams otherwise', () => {
    const visible = teamsVisibleToViewer([EMPTY, NORTH], {
      seeAll: false,
      allowedPersonIds: ['p1'],
    })
    assert.deepEqual(visible.map((team) => team.id), ['team-north'])
    assert.equal(teamsVisibleToViewer([EMPTY, NORTH], { seeAll: true }).length, 2)

    const staff = staffVisibleToViewer(PEOPLE, { seeAll: false, allowedValues: ['a@croydon.gov.uk'] })
    assert.deepEqual(staff.map((person) => person.personId), ['p1'])
    assert.equal(staffVisibleToViewer(PEOPLE, { seeAll: true }).length, 3)

    const hidden = resolveAnalyticsTeamFilter({
      teamId: 'team-north',
      teams: [NORTH],
      seeAll: false,
      allowedPersonIds: ['p9'],
    })
    assert.equal(hidden.unavailableTeam, true)
    assert.deepEqual(hidden.inspectorMatchValues, [])
  })
})
