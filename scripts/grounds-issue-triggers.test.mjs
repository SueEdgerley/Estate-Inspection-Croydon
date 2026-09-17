/**
 * Grounds Maintenance issue-creation rules.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/grounds-issue-triggers.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldAutocreateCaretakerAction,
  shouldAutocreateCaretakerGradedAction,
} from '../lib/caretaker-action-details.js'
import {
  buildGroundsMaintenanceTemplate,
  applyGroundsMaintenanceTemplateToSnapshot,
} from '../lib/grounds-maintenance-template.js'

function questionById(id) {
  const template = buildGroundsMaintenanceTemplate()
  for (const section of template.sections || []) {
    const question = (section.questions || []).find((row) => row.id === id)
    if (question) return { section, question }
  }
  return null
}

describe('Grounds Section 3 litter satisfactory', () => {
  it('Yes = satisfactory → no issue', () => {
    const row = questionById('gm_s3_q1')
    assert.ok(row)
    assert.equal(shouldAutocreateCaretakerAction(row.question, 'Yes', row.section), false)
  })

  it('No = not satisfactory → issue', () => {
    const row = questionById('gm_s3_q1')
    assert.equal(shouldAutocreateCaretakerAction(row.question, 'No', row.section), true)
    assert.equal(row.question.comment_required_when, 'on_no')
  })

  it('photo alone does not create an issue', () => {
    const row = questionById('gm_s3_q1')
    assert.equal(shouldAutocreateCaretakerAction(row.question, 'Yes', row.section), false)
    assert.equal(shouldAutocreateCaretakerAction(row.question, 'NA', row.section), false)
    assert.equal(shouldAutocreateCaretakerGradedAction(row.question, 'A'), false)
  })
})

describe('Grounds graded C/D failures', () => {
  it('creates an issue for C or D regardless of photo', () => {
    const trees = questionById('gm_s6_q1')
    assert.ok(trees)
    assert.equal(trees.question.triggers_issue_answer, 'C,D')
    assert.equal(shouldAutocreateCaretakerGradedAction(trees.question, 'A'), false)
    assert.equal(shouldAutocreateCaretakerGradedAction(trees.question, 'B'), false)
    assert.equal(shouldAutocreateCaretakerGradedAction(trees.question, 'NA'), false)
    assert.equal(shouldAutocreateCaretakerGradedAction(trees.question, 'C'), true)
    assert.equal(shouldAutocreateCaretakerGradedAction(trees.question, 'D'), true)
  })

  it('follow-up Yes still creates an issue; follow-up No does not', () => {
    const follow = questionById('gm_s1_q2')
    assert.equal(shouldAutocreateCaretakerAction(follow.question, 'Yes', follow.section), true)
    assert.equal(shouldAutocreateCaretakerAction(follow.question, 'No', follow.section), false)
  })
})

describe('Submitted Grounds snapshots keep original question wording', () => {
  it('preserves stored litter question text while applying future trigger flags', () => {
    const storedText =
      'Please confirm whether litter removal from communal areas, grassed areas and shrubs is satisfactory'
    const patched = applyGroundsMaintenanceTemplateToSnapshot({
      name: 'Grounds Maintenance',
      template_key: 'grounds_maintenance',
      sections: [
        {
          id: 'gm_sec_3_litter',
          questions: [
            {
              id: 'gm_s3_q1',
              question_text: storedText,
              label: storedText,
              question_type: 'yes_no',
            },
          ],
        },
      ],
    })
    const question = patched.sections
      .flatMap((section) => section.questions || [])
      .find((row) => row.id === 'gm_s3_q1')
    assert.equal(question.question_text, storedText)
    assert.equal(shouldAutocreateCaretakerAction(question, 'Yes'), false)
    assert.equal(shouldAutocreateCaretakerAction(question, 'No'), true)
  })
})
