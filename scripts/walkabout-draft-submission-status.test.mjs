/**
 * Walkabout recover-drafts submission labels.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-draft-submission-status.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { walkaboutShowsSavedDraftsByDefault } from '../lib/inspection-status-mode.js'
import {
  classifyWalkaboutDraftSubmission,
  findMatchingSubmittedInspection,
  walkaboutDraftResumeAllowed,
  walkaboutDraftStatusLabel,
  WALKABOUT_DRAFT_SUBMISSION,
} from '../lib/walkabout-draft-submission-status.js'

function walkaboutDraft({ id, location, blockId, date, start }) {
  return {
    id,
    payload: {
      templateId: 'tpl_estate_walkabout_v1',
      locationLabel: location,
      blockId,
      submitBody: {
        template_id: 'tpl_estate_walkabout_v1',
        block_id: blockId,
        inspection_start_time: start,
        answers: { ew_q_planned_date: date },
      },
    },
  }
}

describe('Walkabout recover drafts default', () => {
  it('does not show saved Walkabouts on the blank form', () => {
    assert.equal(walkaboutShowsSavedDraftsByDefault(), false)
  })
})

describe('classifyWalkaboutDraftSubmission', () => {
  const denmark = walkaboutDraft({
    id: 'e8ff28d0-5ae3-4a88-b8ba-1cd75536f052',
    location: 'Denmark Road 108-124',
    blockId: 'blk_000382',
    date: '2026-10-20',
    start: '2026-10-20T09:49:00.000Z',
  })
  const addingtonLeftover = walkaboutDraft({
    id: 'b11528c2-d589-489a-9625-7c0203b6e2cd',
    location: 'Addington Road',
    blockId: 'blk_008',
    date: '2026-10-13',
    start: '2026-10-13T11:28:00.000Z',
  })
  const submittedAddington = {
    id: '0016aaaf-1408-4882-b465-60c93fdddaf1',
    status: 'submitted',
    submitted_at: '2026-10-13T11:31:57.840Z',
    block_name: 'Addington Road',
    block_id: 'blk_008',
    template_id: 'tpl_estate_walkabout_v1',
    type: 'estate_walkabout',
  }

  it('labels an exact submitted id as already submitted and blocks Resume', () => {
    const result = classifyWalkaboutDraftSubmission({
      draft: { id: submittedAddington.id },
      byId: submittedAddington,
      submittedRows: [submittedAddington],
    })
    assert.equal(result.status, WALKABOUT_DRAFT_SUBMISSION.SUBMITTED)
    assert.equal(walkaboutDraftResumeAllowed(result.status), false)
    assert.match(walkaboutDraftStatusLabel(result.status), /Already submitted/)
  })

  it('labels a leftover draft that matches a submitted location and date as already submitted', () => {
    const result = classifyWalkaboutDraftSubmission({
      draft: addingtonLeftover,
      byId: null,
      submittedRows: [submittedAddington],
      listError: false,
      idError: false,
    })
    assert.equal(result.status, WALKABOUT_DRAFT_SUBMISSION.SUBMITTED)
    assert.equal(result.source, 'leftover')
    assert.equal(walkaboutDraftResumeAllowed(result.status), false)
  })

  it('allows Resume for a genuine unfinished draft that is not in production', () => {
    const result = classifyWalkaboutDraftSubmission({
      draft: denmark,
      byId: null,
      submittedRows: [submittedAddington],
      listError: false,
      idError: false,
    })
    assert.equal(result.status, WALKABOUT_DRAFT_SUBMISSION.NOT_SUBMITTED)
    assert.equal(walkaboutDraftResumeAllowed(result.status), true)
    assert.equal(walkaboutDraftStatusLabel(result.status), '')
  })

  it('does not treat Addington as Addison', () => {
    const addison = walkaboutDraft({
      id: 'addison-draft',
      location: 'Addison Road 15-57',
      blockId: 'blk_012',
      date: '2026-10-13',
      start: '2026-10-13T11:28:00.000Z',
    })
    assert.equal(findMatchingSubmittedInspection(addison, [submittedAddington]), null)
  })

  it('shows status not confirmed when production cannot be checked', () => {
    const result = classifyWalkaboutDraftSubmission({
      draft: denmark,
      byId: null,
      submittedRows: null,
      listError: true,
      idError: true,
    })
    assert.equal(result.status, WALKABOUT_DRAFT_SUBMISSION.UNKNOWN)
    assert.match(walkaboutDraftStatusLabel(result.status), /not confirmed/)
    assert.equal(walkaboutDraftResumeAllowed(result.status), true)
  })
})
