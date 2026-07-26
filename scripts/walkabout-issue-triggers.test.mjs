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
