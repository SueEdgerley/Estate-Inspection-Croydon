/**
 * Deleting one device draft must leave the others in place and must not
 * let autosave write the deleted draft back before the officer enters new work.
 * Run: node --test scripts/delete-device-inspection-draft.test.mjs
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  rememberActiveOfflineDraftId,
  readOfflineInspectionDrafts,
  upsertOfflineInspectionDraft,
  ACTIVE_OFFLINE_DRAFT_LOCAL_KEY,
  ACTIVE_OFFLINE_DRAFT_SESSION_KEY,
} from '../lib/offline-inspection-drafts.js'
import { readInspectionResumeDraft, writeInspectionResumeDraft } from '../lib/inspection-resume-draft.js'
import {
  cancelledStaleDraftWrite,
  deleteDeviceInspectionDraft,
  describeDeviceDraftForDelete,
  nextDraftAutosaveHold,
} from '../lib/delete-device-inspection-draft.js'

function installMemoryStorage() {
  const local = new Map()
  const session = new Map()
  const storage = (data) => ({
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(String(key), String(value))
    },
    removeItem(key) {
      data.delete(key)
    },
  })
  globalThis.window = {
    localStorage: storage(local),
    sessionStorage: storage(session),
  }
}

function draft(id, label, location) {
  return {
    id,
    label,
    updatedAt: '2026-07-16T13:58:31.229Z',
    payload: {
      templateName: label,
      locationLabel: location,
      offlineDraftId: id,
      submitBody: {
        template_id: `tpl_${id}`,
        block_id: `blk_${id}`,
        location,
        answers: { q1: 'Yes' },
      },
    },
  }
}

describe('delete one device draft', () => {
  beforeEach(() => installMemoryStorage())

  it('removes only the chosen draft and leaves it gone when storage is read again', () => {
    upsertOfflineInspectionDraft(draft('keep-me', 'Caretaker Inspection', 'Ashby Court'))
    upsertOfflineInspectionDraft(draft('delete-me', 'Neighbourhood Voice', 'Claret Gardens'))
    writeInspectionResumeDraft({
      templateName: 'Caretaker Inspection',
      locationLabel: 'Ashby Court',
      offlineDraftId: 'keep-me',
      submitBody: { block_id: 'blk_keep-me', location: 'Ashby Court', answers: { q1: 'Yes' } },
    })
    rememberActiveOfflineDraftId('delete-me')

    const result = deleteDeviceInspectionDraft('delete-me')
    assert.equal(result.removed, true)
    assert.equal(result.clearedActive, true)
    assert.equal(result.clearedResume, false)
    assert.deepEqual(
      result.drafts.map((item) => item.id),
      ['keep-me']
    )

    const reread = readOfflineInspectionDrafts()
    assert.deepEqual(
      reread.map((item) => item.id),
      ['keep-me']
    )
    assert.equal(reread[0].payload.locationLabel, 'Ashby Court')
    assert.equal(readInspectionResumeDraft().payload.offlineDraftId, 'keep-me')
    assert.equal(window.sessionStorage.getItem(ACTIVE_OFFLINE_DRAFT_SESSION_KEY), null)
    assert.equal(window.localStorage.getItem(ACTIVE_OFFLINE_DRAFT_LOCAL_KEY), null)
  })

  it('clears the resume copy of the open draft so refresh cannot restore it', () => {
    upsertOfflineInspectionDraft(draft('open-me', 'Grounds Maintenance', 'Brookhurst Court'))
    writeInspectionResumeDraft({
      templateName: 'Grounds Maintenance',
      locationLabel: 'Brookhurst Court',
      offlineDraftId: 'open-me',
      submitBody: { block_id: 'blk_open-me', answers: { q1: 'A' } },
    })

    deleteDeviceInspectionDraft('open-me', { forceClearResume: true })
    assert.equal(readInspectionResumeDraft(), null)
    assert.equal(readOfflineInspectionDrafts().length, 0)
  })

  it('describes the draft shown in the confirmation', () => {
    const details = describeDeviceDraftForDelete(draft('delete-me', 'Neighbourhood Voice', 'Claret Gardens'))
    assert.equal(details.formName, 'Neighbourhood Voice')
    assert.equal(details.location, 'Claret Gardens')
    assert.match(details.lastSaved, /2026/)
  })
})

describe('autosave hold after deleting the open draft', () => {
  it('does not save the deleted payload, then allows a later entry', () => {
    assert.equal(nextDraftAutosaveHold('until-blank', true), 'until-blank')
    assert.equal(nextDraftAutosaveHold('until-blank', false), 'until-edit')
    assert.equal(nextDraftAutosaveHold('until-edit', false), 'until-edit')
    assert.equal(nextDraftAutosaveHold('until-edit', true), false)
    assert.equal(nextDraftAutosaveHold(false, true), false)
  })

  it('ignores an autosave that was already scheduled for the deleted draft', () => {
    assert.equal(cancelledStaleDraftWrite(1, 2), true)
    assert.equal(cancelledStaleDraftWrite(2, 2), false)
  })
})

describe('saved draft list wiring', () => {
  it('asks for confirmation and deletes from the shared device list', () => {
    const panel = readFileSync(new URL('../app/components/SavedInspectionDraftsPanel.jsx', import.meta.url), 'utf8')
    const status = readFileSync(new URL('../app/components/OfflineInspectionStatusPanel.jsx', import.meta.url), 'utf8')
    const form = readFileSync(new URL('../app/inspections/new/NewInspectionForm.jsx', import.meta.url), 'utf8')
    const walkabout = readFileSync(
      new URL('../app/components/estate-walkabout/EstateWalkaboutNewInspectionForm.jsx', import.meta.url),
      'utf8'
    )
    const recover = readFileSync(
      new URL('../app/components/estate-walkabout/WalkaboutRecoverDrafts.jsx', import.meta.url),
      'utf8'
    )
    assert.match(panel, /Delete draft/)
    assert.match(panel, /Form:/)
    assert.match(panel, /Location:/)
    assert.match(panel, /Last saved:/)
    assert.match(panel, /Keep draft/)
    assert.match(status, /onDeleteDraft/)
    assert.match(form, /deleteDeviceInspectionDraft/)
    assert.match(form, /until-blank/)
    assert.match(form, /cancelledStaleDraftWrite/)
    assert.match(walkabout, /deleteDeviceInspectionDraft/)
    assert.match(walkabout, /showSavedDrafts/)
    assert.match(recover, /DeviceDraftDeleteActions/)
  })
})
