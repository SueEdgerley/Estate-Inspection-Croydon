/**
 * Blank Walkabout forms must not create or overwrite saved drafts.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-draft-write-guard.test.mjs
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  draftHasOfficerProgress,
  readOfflineInspectionDrafts,
  upsertOfflineInspectionDraft,
} from '../lib/offline-inspection-drafts.js'
import { flushInspectionDraftPayloadToLocalStorage } from '../lib/inspection-draft-immediate-flush.js'
function installMemoryStorage() {
  const data = new Map()
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return data.has(key) ? data.get(key) : null
      },
      setItem(key, value) {
        data.set(String(key), String(value))
      },
      removeItem(key) {
        data.delete(key)
      },
    },
  }
}

const emptyWalkabout = {
  templateId: 'tpl_estate_walkabout_v1',
  locationLabel: '',
  submitBody: {
    template_id: 'tpl_estate_walkabout_v1',
    answers: { ew_q_area: '', ew_checklist_json: '[]' },
    answer_extras: {},
  },
}

const completedWalkabout = {
  templateId: 'tpl_estate_walkabout_v1',
  locationLabel: 'Littlewood House',
  submitBody: {
    template_id: 'tpl_estate_walkabout_v1',
    block_id: 'blk_000831',
    location: 'Littlewood House',
    answers: {
      ew_q_area: 'North',
      ew_sig_signature: 'A Officer',
      ew_checklist_json: '[]',
    },
    answer_extras: {
      ew_ec_paving_grade: { photo_urls: ['https://example.blob.vercel-storage.com/inspections/a.jpg'] },
    },
  },
}

describe('blank form must not write drafts', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  it('does not create a new draft when the Walkabout form is opened empty', () => {
    const result = flushInspectionDraftPayloadToLocalStorage({
      payload: emptyWalkabout,
      offlineDraftId: '',
    })
    assert.equal(result.skippedEmpty, true)
    assert.equal(result.offlineDraftId, '')
    assert.equal(readOfflineInspectionDrafts().length, 0)
    assert.equal(draftHasOfficerProgress(emptyWalkabout), false)
  })

  it('refuses to overwrite a completed draft with a blank payload', () => {
    upsertOfflineInspectionDraft({ id: 'draft-complete', label: 'Estate Walkabout', payload: completedWalkabout })
    const result = upsertOfflineInspectionDraft({
      id: 'draft-complete',
      label: 'Estate Walkabout',
      payload: emptyWalkabout,
    })
    assert.equal(result.skippedBlankOverwrite, true)
    const stored = readOfflineInspectionDrafts().find((draft) => draft.id === 'draft-complete')
    assert.equal(stored.payload.submitBody.location, 'Littlewood House')
    assert.equal(stored.payload.submitBody.answers.ew_q_area, 'North')
    assert.equal(stored.payload.submitBody.answer_extras.ew_ec_paving_grade.photo_urls.length, 1)
  })

  it('resuming one draft does not delete another', () => {
    upsertOfflineInspectionDraft({ id: 'a', label: 'Estate Walkabout', payload: completedWalkabout })
    upsertOfflineInspectionDraft({
      id: 'b',
      label: 'Estate Walkabout',
      payload: {
        ...completedWalkabout,
        locationLabel: 'Cherry Tree Green 1A-1D',
        submitBody: { ...completedWalkabout.submitBody, block_id: 'blk_000258', location: 'Cherry Tree Green 1A-1D' },
      },
    })
    upsertOfflineInspectionDraft({ id: 'a', label: 'Estate Walkabout', payload: completedWalkabout })
    const ids = readOfflineInspectionDrafts().map((draft) => draft.id).sort()
    assert.deepEqual(ids, ['a', 'b'])
  })

  it('keeps answers, signature and a local photograph when a blank form tries to overwrite', () => {
    const local = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'
    const original = {
      ...completedWalkabout,
      submitBody: {
        ...completedWalkabout.submitBody,
        answers: {
          ...completedWalkabout.submitBody.answers,
          ew_sig_signature: 'N Morah',
          ew_sig_inspection_date: '2026-10-08',
        },
        answer_extras: {
          ew_ec_paving_grade: {
            comment: 'Uneven slabs near the entrance',
            photo_urls: [
              'https://example.blob.vercel-storage.com/inspections/a.jpg',
              'https://example.blob.vercel-storage.com/inspections/b.jpg',
              'https://example.blob.vercel-storage.com/inspections/c.jpg',
              local,
              'https://example.blob.vercel-storage.com/inspections/e.jpg',
            ],
          },
        },
      },
    }
    upsertOfflineInspectionDraft({ id: 'littlewood-original', label: 'Estate Walkabout', payload: original })
    const result = upsertOfflineInspectionDraft({
      id: 'littlewood-original',
      label: 'Estate Walkabout',
      payload: emptyWalkabout,
    })
    assert.equal(result.skippedBlankOverwrite, true)
    const stored = readOfflineInspectionDrafts().find((draft) => draft.id === 'littlewood-original')
    assert.equal(stored.payload.submitBody.answers.ew_sig_signature, 'N Morah')
    assert.equal(stored.payload.submitBody.answer_extras.ew_ec_paving_grade.comment, 'Uneven slabs near the entrance')
    assert.equal(stored.payload.submitBody.answer_extras.ew_ec_paving_grade.photo_urls[3], local)
    assert.equal(stored.payload.submitBody.answer_extras.ew_ec_paving_grade.photo_urls.length, 5)
  })
})

describe('other inspection forms still save and are not overwritten', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  const caretaker = {
    templateId: 'tpl_caretaker_v1',
    templateName: 'Caretaker Inspection',
    locationLabel: 'Park Hill',
    submitBody: {
      template_id: 'tpl_caretaker_v1',
      block_id: 'blk_001000',
      location: 'Park Hill',
      answers: { cm_canonical_internal_cleaning_q1: 'Yes' },
      answer_extras: {
        cm_canonical_internal_cleaning_q1: {
          comment: 'Lobby complete',
          photo_urls: ['https://example.blob.vercel-storage.com/inspections/ct.jpg'],
        },
      },
    },
  }

  const emptyCaretaker = {
    templateId: 'tpl_caretaker_v1',
    submitBody: {
      template_id: 'tpl_caretaker_v1',
      answers: {},
      answer_extras: {},
    },
  }

  it('still writes a Caretaker draft that has answers, comments and photographs', () => {
    const result = flushInspectionDraftPayloadToLocalStorage({
      payload: caretaker,
      offlineDraftId: 'caretaker-1',
    })
    assert.equal(result.skippedEmpty, undefined)
    assert.equal(result.saved, true)
    const stored = readOfflineInspectionDrafts().find((draft) => draft.id === 'caretaker-1')
    assert.equal(stored.payload.submitBody.answers.cm_canonical_internal_cleaning_q1, 'Yes')
    assert.equal(stored.payload.submitBody.answer_extras.cm_canonical_internal_cleaning_q1.comment, 'Lobby complete')
    assert.equal(stored.payload.submitBody.answer_extras.cm_canonical_internal_cleaning_q1.photo_urls.length, 1)
  })

  it('does not let an empty Caretaker form overwrite a completed Caretaker draft', () => {
    upsertOfflineInspectionDraft({ id: 'caretaker-1', label: 'Caretaker Inspection', payload: caretaker })
    const result = upsertOfflineInspectionDraft({
      id: 'caretaker-1',
      label: 'Caretaker Inspection',
      payload: emptyCaretaker,
    })
    assert.equal(result.skippedBlankOverwrite, true)
    const stored = readOfflineInspectionDrafts().find((draft) => draft.id === 'caretaker-1')
    assert.equal(stored.payload.submitBody.location, 'Park Hill')
    assert.equal(stored.payload.submitBody.answers.cm_canonical_internal_cleaning_q1, 'Yes')
  })

  it('keeps a Caretaker draft when a Walkabout draft is saved alongside it', () => {
    upsertOfflineInspectionDraft({ id: 'caretaker-1', label: 'Caretaker Inspection', payload: caretaker })
    upsertOfflineInspectionDraft({ id: 'walkabout-1', label: 'Estate Walkabout', payload: completedWalkabout })
    const ids = readOfflineInspectionDrafts().map((draft) => draft.id).sort()
    assert.deepEqual(ids, ['caretaker-1', 'walkabout-1'])
  })
})
