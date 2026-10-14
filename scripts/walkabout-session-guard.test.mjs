/**
 * New Walkabout must not inherit a previous inspection.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-session-guard.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  alreadySubmittedInspectionReplay,
  consumeWalkaboutNextBlockCarryOver,
  resolveWalkaboutClientInspectionId,
  shouldFlushWalkaboutDraftBeforeCamera,
  syncWalkaboutDraftIdInUrl,
  walkaboutHref,
  walkaboutInterruptedSubmitMessage,
  walkaboutNewFormShouldBeBlank,
  walkaboutShouldAutosaveDraft,
  walkaboutShouldBeginSubmit,
  walkaboutShouldRestoreAfterReload,
  walkaboutShouldRestoreOnMount,
  walkaboutSubmitButtonLabel,
  withWalkaboutDraftIdQuery,
  writeWalkaboutNextBlockFlag,
} from '../lib/walkabout-session-guard.js'
import { shouldWriteWalkaboutDraftAfterRestore } from '../lib/walkabout-draft-restore.js'
import { ESTATE_WALKABOUT_TEMPLATE_ID } from '../lib/estate-walkabout-template.js'

const HILLSIDE_ID = 'febbfa6e-12e0-4f3c-ba48-5973cd4f7de9'

describe('new inspection vs Resume', () => {
  it('does not auto-restore a leftover active draft into a new inspection', () => {
    assert.equal(
      walkaboutShouldRestoreOnMount({
        urlDraftId: '',
        initialDraftId: '',
        submitCompleted: false,
      }),
      false
    )
    assert.equal(walkaboutNewFormShouldBeBlank({ isExplicitResume: false }), true)
  })

  it('restores only when Resume or draft_id is explicit', () => {
    assert.equal(
      walkaboutShouldRestoreOnMount({ urlDraftId: HILLSIDE_ID, initialDraftId: '' }),
      true
    )
    assert.equal(
      walkaboutShouldRestoreOnMount({ urlDraftId: '', initialDraftId: HILLSIDE_ID }),
      true
    )
    assert.equal(walkaboutNewFormShouldBeBlank({ isExplicitResume: true }), false)
  })

  it('does not restore after a successful submit', () => {
    assert.equal(
      walkaboutShouldRestoreOnMount({
        urlDraftId: HILLSIDE_ID,
        initialDraftId: HILLSIDE_ID,
        submitCompleted: true,
      }),
      false
    )
  })

  it('keeps Resume href pointing at the same draft id', () => {
    assert.equal(
      walkaboutHref({ templateId: ESTATE_WALKABOUT_TEMPLATE_ID, draftId: HILLSIDE_ID }),
      `/inspections/new?template_id=${ESTATE_WALKABOUT_TEMPLATE_ID}&draft_id=${HILLSIDE_ID}`
    )
    assert.equal(
      walkaboutHref({ templateId: ESTATE_WALKABOUT_TEMPLATE_ID }),
      `/inspections/new?template_id=${ESTATE_WALKABOUT_TEMPLATE_ID}`
    )
  })
})

describe('after submission', () => {
  it('stops autosave so the submitted inspection cannot reappear as a new draft', () => {
    assert.equal(
      walkaboutShouldAutosaveDraft({
        submitCompleted: true,
        hasOfficerProgress: true,
        submittedInspectionId: HILLSIDE_ID,
      }),
      false
    )
    assert.equal(
      walkaboutShouldAutosaveDraft({
        submitCompleted: false,
        submittedInspectionId: '',
        suppressUntilEdit: false,
        hasOfficerProgress: true,
      }),
      true
    )
  })

  it('does not mint a new id while a submit is in flight or after success', () => {
    const first = resolveWalkaboutClientInspectionId({
      existingDraftId: '',
      inFlightId: '',
      createId: () => 'id-1',
    })
    assert.equal(first, 'id-1')
    const retry = resolveWalkaboutClientInspectionId({
      existingDraftId: '',
      inFlightId: 'id-1',
      createId: () => 'id-2',
    })
    assert.equal(retry, 'id-1')
    const afterResume = resolveWalkaboutClientInspectionId({
      existingDraftId: HILLSIDE_ID,
      inFlightId: '',
      createId: () => 'id-3',
    })
    assert.equal(afterResume, HILLSIDE_ID)
  })

  it('blocks a second Submit tap while the first is in flight or already succeeded', () => {
    assert.equal(walkaboutShouldBeginSubmit({ inFlight: true }), false)
    assert.equal(walkaboutShouldBeginSubmit({ submitCompleted: true }), false)
    assert.equal(walkaboutShouldBeginSubmit({ hasActivePhotoUploads: true }), false)
    assert.equal(walkaboutShouldBeginSubmit({}), true)
  })

  it('treats a retry of an already-submitted id as success without a new record', () => {
    const replay = alreadySubmittedInspectionReplay({
      id: HILLSIDE_ID,
      status: 'submitted',
      submitted_at: '2026-10-14T10:00:00.000Z',
    })
    assert.equal(replay.alreadySubmitted, true)
    assert.equal(replay.inspectionId, HILLSIDE_ID)
    assert.equal(alreadySubmittedInspectionReplay({ id: 'x', status: 'draft' }), null)
  })
})

describe('photographs and interrupted submit', () => {
  it('still flushes the in-progress draft before the camera opens', () => {
    assert.equal(shouldFlushWalkaboutDraftBeforeCamera({ submitCompleted: false }), true)
    assert.equal(shouldFlushWalkaboutDraftBeforeCamera({ submitCompleted: true }), false)
  })

  it('does not rebuild a restored draft until the officer edits', () => {
    assert.equal(
      shouldWriteWalkaboutDraftAfterRestore({ restoredUnedited: true, officerEdited: false }),
      false
    )
  })

  it('reloads only the current draft after camera process-death, not a previous one', () => {
    assert.equal(
      walkaboutShouldRestoreAfterReload({
        currentDraftId: HILLSIDE_ID,
        candidateDraftId: HILLSIDE_ID,
      }),
      true
    )
    assert.equal(
      walkaboutShouldRestoreAfterReload({
        currentDraftId: '',
        candidateDraftId: HILLSIDE_ID,
      }),
      false
    )
    assert.equal(
      walkaboutShouldRestoreAfterReload({
        currentDraftId: 'new-id',
        candidateDraftId: HILLSIDE_ID,
      }),
      false
    )
  })

  it('keeps draft_id on the URL for camera reload and strips it after submit', () => {
    assert.equal(
      withWalkaboutDraftIdQuery('?template_id=tpl_estate_walkabout_v1', HILLSIDE_ID),
      `?template_id=tpl_estate_walkabout_v1&draft_id=${HILLSIDE_ID}`
    )
    assert.equal(
      withWalkaboutDraftIdQuery(
        `?template_id=tpl_estate_walkabout_v1&draft_id=${HILLSIDE_ID}`,
        ''
      ),
      '?template_id=tpl_estate_walkabout_v1'
    )
  })

  it('syncs draft_id with replaceState so a camera reload can Resume the same draft', () => {
    const calls = []
    globalThis.window = {
      location: {
        href: `https://estateinspections.co.uk/inspections/new?template_id=${ESTATE_WALKABOUT_TEMPLATE_ID}`,
      },
      history: {
        state: null,
        replaceState(_state, _title, url) {
          calls.push(url)
        },
      },
    }
    syncWalkaboutDraftIdInUrl(HILLSIDE_ID)
    assert.equal(
      calls[0],
      `/inspections/new?template_id=${ESTATE_WALKABOUT_TEMPLATE_ID}&draft_id=${HILLSIDE_ID}`
    )
    globalThis.window.location.href = `https://estateinspections.co.uk${calls[0]}`
    syncWalkaboutDraftIdInUrl('')
    assert.equal(calls[1], `/inspections/new?template_id=${ESTATE_WALKABOUT_TEMPLATE_ID}`)
    delete globalThis.window
  })

  it('explains an interrupted submit without inviting a new inspection id', () => {
    assert.match(
      walkaboutInterruptedSubmitMessage({ draftCreatedOnServer: true }),
      /same record/
    )
    assert.match(
      walkaboutInterruptedSubmitMessage({ locallySaved: true }),
      /draft on this phone/
    )
  })
})

describe('labels and next-block carry-over', () => {
  it('labels Submit distinctly from Save draft', () => {
    assert.equal(walkaboutSubmitButtonLabel({ isOnline: true }), 'Submit inspection')
    assert.equal(walkaboutSubmitButtonLabel({ isSubmitting: true, isOnline: true }), 'Submitting…')
    assert.equal(walkaboutSubmitButtonLabel({ isOnline: false }), 'Save draft on this phone')
  })

  it('applies attendee carry-over only after Start next block, not a genuine new inspection', () => {
    const store = new Map()
    globalThis.window = {
      sessionStorage: {
        getItem(key) {
          return store.has(key) ? store.get(key) : null
        },
        setItem(key, value) {
          store.set(String(key), String(value))
        },
        removeItem(key) {
          store.delete(key)
        },
      },
    }
    const hillsideAttendees = { ew_q_area: 'North', ew_st_caretaker_present: 'Yes' }
    assert.deepEqual(
      consumeWalkaboutNextBlockCarryOver(() => hillsideAttendees),
      {}
    )
    writeWalkaboutNextBlockFlag()
    assert.deepEqual(
      consumeWalkaboutNextBlockCarryOver(() => hillsideAttendees),
      hillsideAttendees
    )
    assert.deepEqual(
      consumeWalkaboutNextBlockCarryOver(() => hillsideAttendees),
      {}
    )
    delete globalThis.window
  })
})
