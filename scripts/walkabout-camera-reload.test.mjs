/**
 * Camera interrupt, page reload and failed photograph upload.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-camera-reload.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  WALKABOUT_CAMERA_FLUSH_EVENTS,
  failedPhotoUploadBlocksSubmit,
  isDurablePhotoUrl,
  photosLostOnReload,
  resolveDraftToRestoreAfterReload,
  restoredDraftKeepsAnswersAndPhotos,
  sanitizeRestoredPhotoUrls,
  shouldFlushDraftBeforeCameraOpen,
  shouldPersistPhotoLocallyBeforeUpload,
  shouldShowPhotoRetryButton,
  urlsAfterFailedPhotoUpload,
} from '../lib/walkabout-photo-recovery.js'
import { walkaboutPendingPhotoMessage } from '../lib/walkabout-submit-blockers.js'
import {
  clearActiveOfflineDraftId,
  readActiveOfflineDraftId,
  rememberActiveOfflineDraftId,
} from '../lib/offline-inspection-drafts.js'
import { isPendingLocalPhotoUrl, replaceUrlInList as replacePhotoListUrl } from '../lib/offline-photo-upload.js'
import { capActionPhotoUrls } from '../lib/action-photos.js'

function installMemoryStorage() {
  const session = new Map()
  const local = new Map()
  const make = (map) => ({
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
  })
  globalThis.window = {
    sessionStorage: make(session),
    localStorage: make(local),
  }
  return { session, local }
}

const hillsideId = 'febbfa6e-12e0-4f3c-ba48-5973cd4f7de9'
const emptyTwinId = 'a8635191-empty-twin'

function hillsideDraft({ photos } = {}) {
  return {
    id: hillsideId,
    payload: {
      submitBody: {
        block_id: 'blk_000684',
        answers: {
          ew_q_area: 'North',
          ew_it_communal_areas_clear: 'No',
          ew_checklist_json: '[]',
        },
        answer_extras: {
          ew_it_communal_areas_clear: {
            photo_urls: photos || [
              'https://example.blob.vercel-storage.com/inspections/1.jpg',
              'data:image/jpeg;base64,abc',
            ],
          },
        },
      },
    },
  }
}

function emptyTwin() {
  return {
    id: emptyTwinId,
    payload: {
      submitBody: {
        block_id: 'blk_000684',
        answers: { ew_q_area: '', ew_checklist_json: '[]' },
        answer_extras: {},
      },
    },
  }
}

describe('camera interruption', () => {
  it('treats opening the Android camera as a reason Edge may hide or reload the Walkabout', () => {
    assert.equal(shouldFlushDraftBeforeCameraOpen(), true)
    assert.ok(WALKABOUT_CAMERA_FLUSH_EVENTS.includes('pagehide'))
    assert.ok(WALKABOUT_CAMERA_FLUSH_EVENTS.includes('visibilitychange'))
  })
})

describe('photograph durability', () => {
  it('keeps data URLs and uploaded https URLs across a reload, and drops blob URLs', () => {
    const urls = [
      'https://example.blob.vercel-storage.com/inspections/1.jpg',
      'data:image/jpeg;base64,qqq',
      'blob:https://estateinspections.co.uk/123',
    ]
    assert.equal(isDurablePhotoUrl(urls[0]), true)
    assert.equal(isDurablePhotoUrl(urls[1]), true)
    assert.equal(isDurablePhotoUrl(urls[2]), false)
    assert.deepEqual(sanitizeRestoredPhotoUrls(urls), [urls[0], urls[1]])
    assert.deepEqual(photosLostOnReload(urls), [urls[2]])
  })

  it('saves compressed bytes locally before a network upload is attempted', () => {
    assert.equal(shouldPersistPhotoLocallyBeforeUpload(), true)
  })

  it('keeps the local data URL when reception drops during upload', () => {
    const current = ['https://example.blob.vercel-storage.com/inspections/1.jpg']
    const local = 'data:image/jpeg;base64,offline'
    const next = urlsAfterFailedPhotoUpload(current, local)
    assert.deepEqual(next, [...current, local])
    assert.equal(next.some(isPendingLocalPhotoUrl), true)
  })

  it('replaces the local copy with the Blob URL after a successful retry', () => {
    const local = 'data:image/jpeg;base64,offline'
    const remote = 'https://example.blob.vercel-storage.com/inspections/2.jpg'
    const next = replacePhotoListUrl([local], local, remote)
    assert.deepEqual(next, [remote])
    assert.equal(next.some(isPendingLocalPhotoUrl), false)
  })

  it('keeps a local Littlewood paving photograph at the cap of five and allows retry upload', () => {
    const local = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD'
    const paving = [
      'https://example.blob.vercel-storage.com/inspections/p1.jpg',
      'https://example.blob.vercel-storage.com/inspections/p2.jpg',
      'https://example.blob.vercel-storage.com/inspections/p3.jpg',
      local,
      'https://example.blob.vercel-storage.com/inspections/p5.jpg',
    ]
    const restored = capActionPhotoUrls(sanitizeRestoredPhotoUrls(paving))
    assert.equal(restored.length, 5)
    assert.equal(restored[3], local)
    assert.equal(failedPhotoUploadBlocksSubmit({ pendingLocalUrls: restored }), true)
    assert.equal(shouldShowPhotoRetryButton({ uploading: false, pendingLocalUrls: restored }), true)
    const uploaded = 'https://example.blob.vercel-storage.com/inspections/p4.jpg'
    const afterRetry = replacePhotoListUrl(restored, local, uploaded)
    assert.deepEqual(afterRetry, [
      paving[0],
      paving[1],
      paving[2],
      uploaded,
      paving[4],
    ])
    assert.equal(failedPhotoUploadBlocksSubmit({ pendingLocalUrls: afterRetry }), false)
  })
})

describe('failed photograph upload', () => {
  it('blocks submit while photos are pending and shows a retry path', () => {
    const pending = ['data:image/jpeg;base64,offline']
    assert.equal(failedPhotoUploadBlocksSubmit({ pendingLocalUrls: pending }), true)
    assert.equal(shouldShowPhotoRetryButton({ uploading: false, pendingLocalUrls: pending }), true)
    assert.match(walkaboutPendingPhotoMessage({ hasPendingLocalUrls: true }), /Retry upload/)
    assert.equal(failedPhotoUploadBlocksSubmit({ pendingLocalUrls: [] }), false)
  })
})

describe('page reload restore', () => {
  it('returns the officer to the same draft with answers and durable photographs', () => {
    const original = hillsideDraft()
    const restored = resolveDraftToRestoreAfterReload({
      drafts: [emptyTwin(), original],
      activeDraftId: hillsideId,
    })
    assert.equal(restored?.id, hillsideId)
    assert.equal(restoredDraftKeepsAnswersAndPhotos(restored), true)
  })

  it('does not guess a similar-time empty twin when the remembered draft id is missing', () => {
    const restored = resolveDraftToRestoreAfterReload({
      drafts: [emptyTwin(), hillsideDraft()],
      activeDraftId: '',
    })
    assert.equal(restored, null)
  })

  it('still finds the draft after sessionStorage is wiped (camera process death)', () => {
    const { session } = installMemoryStorage()
    rememberActiveOfflineDraftId(hillsideId)
    session.clear()
    assert.equal(readActiveOfflineDraftId(), hillsideId)
    clearActiveOfflineDraftId()
    assert.equal(readActiveOfflineDraftId(), '')
  })
})
