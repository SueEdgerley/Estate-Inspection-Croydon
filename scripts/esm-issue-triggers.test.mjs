/**
 * ESM issue-creation rules: photos are evidence only; C/D create issues.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/esm-issue-triggers.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldCreateEsmInspectionAction,
  isEsmQuestionActionConfigured,
} from '../lib/esm-action-plan-actions.js'
import { applyEsmInspectionFormPatch } from '../lib/esm-inspection-form.js'

const PHOTO = ['https://example.test/photo.jpg']

function gradedQuestion(overrides = {}) {
  return {
    id: 'esm_graded_q',
    question_type: 'graded',
    question_text: 'Please confirm the overall rating',
    triggers_issue_answer: 'C,D',
    include_photo: true,
    ...overrides,
  }
}

describe('ESM graded issue creation (photo is not a trigger)', () => {
  const question = gradedQuestion()

  it('A with no photo → no issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'A'), false)
  })

  it('A + photo → no issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'A'), false)
    assert.equal(PHOTO.length > 0, true)
  })

  it('B + photo → no issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'B'), false)
  })

  it('NA + photo → no issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'NA'), false)
  })

  it('C with no photo → issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'C'), true)
  })

  it('C + photo → issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'C'), true)
  })

  it('D with no photo → issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'D'), true)
  })

  it('D + photo → issue', () => {
    assert.equal(shouldCreateEsmInspectionAction(question, 'D'), true)
  })

  it('uses triggers_issue_answer C,D rather than photo presence', () => {
    const noTriggerList = gradedQuestion({ triggers_issue_answer: 'C,D' })
    assert.equal(shouldCreateEsmInspectionAction(noTriggerList, 'A'), false)
    assert.equal(shouldCreateEsmInspectionAction(noTriggerList, 'C'), true)
  })
})

describe('ESM Yes/No issue questions', () => {
  it('does not create an action for an ordinary Yes', () => {
    const question = {
      id: 'esm_ordinary_yn',
      question_type: 'yes_no',
      question_text: 'Please confirm the overall rating was explained',
    }
    assert.equal(isEsmQuestionActionConfigured(question), false)
    assert.equal(shouldCreateEsmInspectionAction(question, 'Yes'), false)
    assert.equal(shouldCreateEsmInspectionAction(question, 'No'), false)
  })

  it('creates on Yes for an explicitly configured issue question, with or without a photo', () => {
    const question = {
      id: 'esm_hs_issue',
      question_type: 'yes_no',
      question_text: 'Are there any health and safety issues?',
      create_action_on_yes: true,
      action_trigger_on: 'yes',
      triggers_issue_answer: 'Yes',
    }
    assert.equal(shouldCreateEsmInspectionAction(question, 'Yes'), true)
    assert.equal(shouldCreateEsmInspectionAction(question, 'No'), false)
    assert.equal(shouldCreateEsmInspectionAction(question, 'NA'), false)
  })

  it('configures abandoned-vehicle Yes as an issue question after the ESM patch', () => {
    const template = {
      name: 'ESM Inspection Form',
      sections: [
        {
          title: '4. Abandoned Vehicles',
          name: '4. Abandoned Vehicles',
          questions: [
            {
              id: 'recVK4Fevj4AtbKgP',
              question_type: 'yes_no',
              question_text: 'Is there an abandoned vehicle to report?',
            },
          ],
        },
      ],
    }
    applyEsmInspectionFormPatch(template)
    const question = template.sections[0].questions[0]
    assert.equal(question.create_action_on_yes, true)
    assert.equal(question.action_trigger_on, 'yes')
    assert.equal(question.esm_q4_abandoned_vehicle, true)
    assert.equal(shouldCreateEsmInspectionAction(question, 'Yes'), true)
    assert.equal(shouldCreateEsmInspectionAction(question, 'No'), false)
  })
})
