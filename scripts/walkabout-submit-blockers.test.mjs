/**
 * Walkabout submit blockers and draft-list visibility.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-submit-blockers.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWalkaboutSubmitBlockedMessage,
  describeWalkaboutValidationErrors,
  walkaboutPendingPhotoMessage,
} from '../lib/walkabout-submit-blockers.js'
import {
  resolveInspectionStatusMode,
  savedDraftsShouldRender,
  walkaboutShowsSavedDraftsByDefault,
} from '../lib/inspection-status-mode.js'

describe('submit blockers', () => {
  it('names missing grades, signature and area', () => {
    const lines = describeWalkaboutValidationErrors({
      ew_q_area: 'Select West, South, Central or North',
      ew_ec_paving_grade: 'Select A, B, C, D, or NA',
      ew_sig_signature: 'Enter a signature or signatory name',
    })
    assert.ok(lines.some((line) => line.includes('Estate area')))
    assert.ok(lines.some((line) => line.includes('Paving / signage grade')))
    assert.ok(lines.some((line) => line.includes('Signature')))
    const message = buildWalkaboutSubmitBlockedMessage({
      ew_sig_signature: 'Enter a signature or signatory name',
    })
    assert.match(message, /cannot be submitted yet/)
    assert.match(message, /Nothing has been submitted/)
    assert.match(message, /remains on this phone/)
  })

  it('explains photographs that have not uploaded', () => {
    assert.match(
      walkaboutPendingPhotoMessage({ hasPendingLocalUrls: true }),
      /Retry upload/
    )
    assert.match(
      walkaboutPendingPhotoMessage({ hasActiveUploads: true }),
      /still uploading/
    )
  })
})

describe('saved drafts stay visible online and offline', () => {
  it('Walkabout does not show the saved list on the blank form', () => {
    assert.equal(walkaboutShowsSavedDraftsByDefault(), false)
  })

  it('still allows other forms to render the saved list when the officer is online', () => {
    const mode = resolveInspectionStatusMode({
      isOnline: true,
      activeDraftId: '',
      activeDraftPayload: null,
      submitSuccessMessage: '',
    })
    assert.equal(mode, 'hidden')
    assert.equal(savedDraftsShouldRender(mode), true)
  })

  it('uses a local-save mode, not a submitted mode, while a draft is in progress online', () => {
    const mode = resolveInspectionStatusMode({
      isOnline: true,
      activeDraftId: 'draft-1',
      activeDraftPayload: {
        submitBody: { block_id: 'blk_000831', location: 'Littlewood House', answers: { ew_q_area: 'North' } },
      },
      submitSuccessMessage: '',
    })
    assert.equal(mode, 'online-draft')
    assert.equal(savedDraftsShouldRender(mode), true)
  })
})
