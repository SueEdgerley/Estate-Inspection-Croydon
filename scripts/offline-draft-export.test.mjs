/**
 * Read-only phone draft export: getItem only, both keys, full payload preserved.
 * Run: node --test scripts/offline-draft-export.test.mjs
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  INSPECTION_RESUME_STORAGE_KEY,
  OFFLINE_DRAFTS_STORAGE_KEY,
  readPhoneDraftsBackup,
  summarizeOfflineDraft,
} from '../lib/offline-draft-export.js'

function installMemoryStorage() {
  const data = new Map()
  const writes = []
  const storage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      writes.push(['setItem', key])
      data.set(String(key), String(value))
    },
    removeItem(key) {
      writes.push(['removeItem', key])
      data.delete(key)
    },
  }
  globalThis.window = { localStorage: storage }
  return { data, writes, storage }
}

describe('offline-draft-export source', () => {
  it('does not write or delete localStorage', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/offline-draft-export.js', import.meta.url)), 'utf8')
    assert.equal(/\.(setItem|removeItem|clear)\s*\(/.test(src), false)
    assert.match(src, /getItem/)
  })

  it('recovery page only downloads locally and does not upload or resume', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/phone-drafts/page.jsx', import.meta.url)), 'utf8')
    assert.match(src, /readPhoneDraftsBackup/)
    assert.match(src, /link\.download/)
    assert.equal(src.includes('navigator.share'), false)
    assert.equal(src.includes('fetch('), false)
    assert.equal(src.includes('upsertOfflineInspectionDraft'), false)
    assert.equal(src.includes('writeOfflineInspectionDrafts'), false)
    assert.equal(src.includes('writeInspectionResumeDraft'), false)
    assert.equal(src.includes('/inspections/new'), false)
  })
})

describe('readPhoneDraftsBackup', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  it('reads both storage keys without writing', () => {
    const hillside = {
      id: 'draft-hillside',
      label: 'Estate Walkabout',
      createdAt: '2026-10-06T12:18:00.000Z',
      updatedAt: '2026-10-06T12:30:00.000Z',
      payload: {
        locationLabel: 'Hillside House 1-32',
        submitBody: {
          block_id: 'blk_000684',
          location: 'Hillside House 1-32',
          inspection_start_time: '2026-10-06T12:18:00.000Z',
          answers: {
            ew_q_area: 'North',
            ew_it_mobility_scooters: 'Yes',
            ew_checklist_json: '[]',
          },
          answer_extras: {
            ew_it_mobility_scooters: {
              photo_urls: ['https://example.blob.vercel-storage.com/inspections/1.jpg'],
            },
          },
        },
      },
    }
    const resume = {
      version: 1,
      savedAt: '2026-10-06T12:30:00.000Z',
      payload: hillside.payload,
    }
    window.localStorage.setItem(OFFLINE_DRAFTS_STORAGE_KEY, JSON.stringify([hillside]))
    window.localStorage.setItem(INSPECTION_RESUME_STORAGE_KEY, JSON.stringify(resume))

    const writes = []
    window.localStorage.setItem = (key) => {
      writes.push(['setItem', key])
      throw new Error('export must not write localStorage')
    }
    window.localStorage.removeItem = (key) => {
      writes.push(['removeItem', key])
      throw new Error('export must not delete localStorage')
    }

    const backup = readPhoneDraftsBackup()
    assert.deepEqual(writes, [])
    assert.equal(backup.readOnly, true)
    assert.equal(backup.drafts.length, 1)
    assert.equal(backup.drafts[0].payload.submitBody.location, 'Hillside House 1-32')
    assert.equal(backup.drafts[0].payload.submitBody.answers.ew_q_area, 'North')
    assert.equal(
      backup.drafts[0].payload.submitBody.answer_extras.ew_it_mobility_scooters.photo_urls[0],
      'https://example.blob.vercel-storage.com/inspections/1.jpg'
    )
    assert.equal(backup.resumeSlot.payload.submitBody.block_id, 'blk_000684')
    assert.equal(backup.parseErrors.drafts, null)
    assert.equal(backup.parseErrors.resume, null)
  })

  it('keeps the raw string when a key is not valid JSON', () => {
    window.localStorage.setItem(OFFLINE_DRAFTS_STORAGE_KEY, 'not-json')
    const backup = readPhoneDraftsBackup()
    assert.equal(backup.drafts.length, 0)
    assert.ok(backup.parseErrors.drafts)
    assert.equal(backup.raw[OFFLINE_DRAFTS_STORAGE_KEY], 'not-json')
  })
})

describe('summarizeOfflineDraft', () => {
  it('flags Hillside from location and counts filled answers and photos', () => {
    const summary = summarizeOfflineDraft({
      id: 'draft-hillside',
      label: 'Estate Walkabout',
      updatedAt: '2026-10-06T12:30:00.000Z',
      payload: {
        locationLabel: 'Hillside House 1-32',
        submitBody: {
          block_id: 'blk_000684',
          answers: {
            ew_q_area: 'North',
            ew_it_mobility_scooters: 'Yes',
            ew_checklist_json: '[]',
          },
          answer_extras: {
            ew_it_mobility_scooters: {
              photo_urls: ['https://example.blob.vercel-storage.com/inspections/1.jpg'],
            },
          },
        },
      },
    })
    assert.equal(summary.possibleHillside, true)
    assert.equal(summary.location, 'Hillside House 1-32')
    assert.equal(summary.blockId, 'blk_000684')
    assert.equal(summary.filledAnswerCount, 2)
    assert.equal(summary.photoCount, 1)
    assert.equal(summary.uploadedPhotoCount, 1)
  })

  it('flags Hillside from known block ids even without a location label', () => {
    const summary = summarizeOfflineDraft({
      id: 'draft-block-only',
      payload: { submitBody: { block_id: 'blk_000684', answers: {} } },
    })
    assert.equal(summary.possibleHillside, true)
    assert.equal(summary.blockId, 'blk_000684')
  })
})
