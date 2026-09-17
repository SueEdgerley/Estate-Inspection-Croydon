/**
 * Caretaker issue-creation rules.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/caretaker-issue-triggers.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldAutocreateCaretakerAction,
} from '../lib/caretaker-action-details.js'
import {
  CARETAKER_OTHER_INTERNAL_CLEANING_QUESTION,
  replaceWithCanonicalCaretakerTemplate,
} from '../lib/caretaker-canonical-template.js'
import { applyTemplateDisplayPatches } from '../lib/caretaker-fire-template-patch.js'

function canonicalQuestions() {
  const template = replaceWithCanonicalCaretakerTemplate({
    name: 'Caretaker Inspection',
    template_type: 'caretaker',
    sections: [],
  })
  return (template.sections || []).flatMap((section) =>
    (section.questions || []).map((question) => ({ section, question }))
  )
}

describe('Caretaker ordinary cleaning-completed rows', () => {
  it('Yes/Completed with or without a photo does not create an issue', () => {
    const lobby = canonicalQuestions().find(({ question }) => question.id === 'cm_canonical_internal_cleaning_q1')
    assert.ok(lobby)
    assert.equal(shouldAutocreateCaretakerAction(lobby.question, 'Yes', lobby.section), false)
    assert.equal(shouldAutocreateCaretakerAction(lobby.question, 'No', lobby.section), false)
    assert.equal(lobby.question.question_text, 'Entrance Lobby')
  })
})

describe('Caretaker other internal cleaning issue (future wording)', () => {
  it('asks whether there are other internal cleaning issues to report', () => {
    const other = canonicalQuestions().find(
      ({ question }) => question.id === 'cm_canonical_internal_cleaning_q12'
    )
    assert.ok(other)
    assert.equal(other.question.question_text, CARETAKER_OTHER_INTERNAL_CLEANING_QUESTION)
    assert.equal(other.question.comment_required_when, 'on_yes')
    assert.equal(other.question.require_comment_on_yes, true)
    assert.equal(other.question.require_photo_on_yes, false)
    assert.equal(other.question.caretaker_simple_photo_capture, false)
  })

  it('No → no issue', () => {
    const other = canonicalQuestions().find(
      ({ question }) => question.id === 'cm_canonical_internal_cleaning_q12'
    )
    assert.equal(shouldAutocreateCaretakerAction(other.question, 'No', other.section), false)
  })

  it('Yes + required details → issue; photo is not required to create it', () => {
    const other = canonicalQuestions().find(
      ({ question }) => question.id === 'cm_canonical_internal_cleaning_q12'
    )
    assert.equal(shouldAutocreateCaretakerAction(other.question, 'Yes', other.section), true)
  })
})

describe('Submitted caretaker snapshots keep original question wording', () => {
  it('does not rewrite a stored Other-issue question when applying display patches', () => {
    const stored = {
      name: 'Caretaker Inspection',
      template_type: 'caretaker',
      sections: [
        {
          title: '1. Internal Cleaning - Cleaning completed for ...',
          questions: [
            {
              id: 'cm_canonical_internal_cleaning_q12',
              question_text: 'Other internal cleaning issue (specify in comments)',
              label: 'Other internal cleaning issue (specify in comments)',
              question_type: 'yes_no',
              create_action_on_yes: true,
              action_trigger_on: 'yes',
            },
          ],
        },
      ],
    }
    applyTemplateDisplayPatches(stored)
    assert.equal(
      stored.sections[0].questions[0].question_text,
      'Other internal cleaning issue (specify in comments)'
    )
  })
})
