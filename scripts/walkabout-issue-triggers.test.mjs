/**
 * Walkabout issue-creation trigger rules.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-issue-triggers.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  WALKABOUT_ISSUE_ON_YES_QIDS,
  inspectionAnswerTriggersWalkaboutItemIssue,
  walkaboutActionTextLooksDuplicate,
} from '../lib/estate-walkabout-actions.js'
import {
  buildEstateWalkaboutTemplate,
  omitHiddenWalkaboutPrivateGardensOvergrown,
} from '../lib/estate-walkabout-template.js'

function ynQuestion(id) {
  return { id, question_type: 'yes_no' }
}

describe('Walkabout standard item issue triggers', () => {
  it('creates on Yes for issue-on-yes questions (bulk refuse, hazards, etc.)', () => {
    for (const id of WALKABOUT_ISSUE_ON_YES_QIDS) {
      assert.equal(inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion(id), null, 'Yes'), true)
      assert.equal(inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion(id), null, 'No'), false)
      assert.equal(inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion(id), null, 'NA'), false)
    }
  })

  it('creates on No for inspect-style questions (roof access, lighting, etc.)', () => {
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion('ew_it_roof_access'), null, 'No'),
      true
    )
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion('ew_it_roof_access'), null, 'Yes'),
      false
    )
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion('ew_it_communal_lighting'), null, 'No'),
      true
    )
  })

  it('creates on No for communal areas and private gardens maintained', () => {
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion('ew_it_communal_areas_clear'), null, 'No'),
      true
    )
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion('ew_it_communal_areas_clear'), null, 'Yes'),
      false
    )
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(
        ynQuestion('ew_it_private_gardens_maintained'),
        null,
        'No'
      ),
      true
    )
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(
        ynQuestion('ew_it_private_gardens_maintained'),
        null,
        'Yes'
      ),
      false
    )
  })

  it('creates on Yes for mobility scooters, discarded items, and overgrown gardens', () => {
    for (const id of [
      'ew_it_mobility_scooters',
      'ew_it_discarded_items_gardens',
      'ew_it_private_gardens_overgrown',
    ]) {
      assert.equal(inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion(id), null, 'Yes'), true)
      assert.equal(inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion(id), null, 'No'), false)
      assert.equal(inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion(id), null, 'NA'), false)
    }
  })

  it('does not create from empty / non-trigger answers (photo+comment alone cannot trigger)', () => {
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion('ew_it_graffiti'), null, ''),
      false
    )
    assert.equal(
      inspectionAnswerTriggersWalkaboutItemIssue(ynQuestion('ew_it_roof_access'), null, null),
      false
    )
  })
})

describe('walkaboutActionTextLooksDuplicate', () => {
  it('matches overlapping additional-item text against existing checklist actions', () => {
    const existing = [
      {
        title: 'Item inspections - Is a bulk refuse removal required?',
        description: 'Response: Yes\nComment: Bulk refuse behind block 279',
        comment: 'Bulk refuse behind block 279',
      },
    ]
    assert.equal(
      walkaboutActionTextLooksDuplicate(existing, 'Bulk refuse behind block 279 needs collection'),
      true
    )
    assert.equal(walkaboutActionTextLooksDuplicate(existing, 'Broken communal light on stair 3'), false)
  })
})

describe('Walkabout Section 4 new questions', () => {
  it('places the new questions before roof access and keeps existing ids in order', () => {
    const section = buildEstateWalkaboutTemplate().sections.find(
      (s) => s.id === 'ew_sec_item_inspections'
    )
    const ids = (section?.questions || []).map((q) => q.id)
    assert.deepEqual(ids.slice(0, 6), [
      'ew_it_communal_areas_clear',
      'ew_it_mobility_scooters',
      'ew_it_private_gardens_maintained',
      'ew_it_private_gardens_overgrown',
      'ew_it_discarded_items_gardens',
      'ew_it_roof_access',
    ])
    assert.equal(ids.includes('ew_it_tank_secure'), true)
    assert.equal(ids.includes('ew_it_play_areas'), true)
  })

  it('omits a hidden overgrown follow-up when gardens are not marked No', () => {
    const hidden = omitHiddenWalkaboutPrivateGardensOvergrown({
      ew_it_private_gardens_maintained: 'Yes',
      ew_it_private_gardens_overgrown: 'Yes',
      ew_it_private_gardens_overgrown_comment: 'Weeds',
    })
    assert.equal(hidden.ew_it_private_gardens_overgrown, undefined)
    assert.equal(hidden.ew_it_private_gardens_overgrown_comment, undefined)
    assert.equal(hidden.ew_it_private_gardens_maintained, 'Yes')

    const shown = omitHiddenWalkaboutPrivateGardensOvergrown({
      ew_it_private_gardens_maintained: 'No',
      ew_it_private_gardens_overgrown: 'Yes',
    })
    assert.equal(shown.ew_it_private_gardens_overgrown, 'Yes')
  })
})
