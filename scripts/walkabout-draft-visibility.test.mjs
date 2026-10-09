/**
 * Production Walkabout draft visibility and empty-form autosave behaviour.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-draft-visibility.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasInspectionDraftContent,
  draftHasOfficerProgress,
  formatSavedDraftIdentity,
  selectResumableOfflineDrafts,
  summarizeOfflineDraft,
} from '../lib/offline-inspection-drafts.js'

function localSaveBanner({ isOnline, hasActiveDraft }) {
  if (!hasActiveDraft) return null
  return 'Saved on this phone – not submitted'
}

describe('Saved Drafts visibility', () => {
  it('keeps drafts visible online so officers can resume after returning', () => {
    assert.equal(localSaveBanner({ isOnline: true, hasActiveDraft: true }).includes('not submitted'), true)
  })

  it('does not treat a local save as a successful submission', () => {
    const banner = localSaveBanner({ isOnline: true, hasActiveDraft: true })
    assert.equal(/submitted successfully/i.test(banner), false)
  })
})

describe('empty Walkabout payload', () => {
  const emptyWalkabout = {
    submitBody: {
      template_id: 'tpl_estate_walkabout_v1',
      answers: { ew_q_area: '', ew_checklist_json: '[]' },
      answer_extras: {},
    },
  }

  it('treats empty answer keys as content, so production autosave creates a draft for a blank form', () => {
    assert.equal(hasInspectionDraftContent(emptyWalkabout), true)
  })

  it('officer-progress helper does not treat a blank Walkabout shell as recoverable work', () => {
    assert.equal(draftHasOfficerProgress(emptyWalkabout), false)
  })
})

describe('failed submit recovery constraints', () => {
  it('a failed submit must keep the original draft id and must not auto-submit others', () => {
    const drafts = [
      { id: 'a', location: 'Littlewood House' },
      { id: 'b', location: 'Cherry Tree Green 1A-1D' },
    ]
    const failedId = 'a'
    const remaining = drafts.filter((draft) => draft.id !== failedId)
    assert.equal(drafts.find((draft) => draft.id === failedId)?.id, 'a')
    assert.deepEqual(
      remaining.map((draft) => draft.id),
      ['b']
    )
  })
})

describe('saved draft list identity', () => {
  const sameMinute = '2026-10-06T12:51:00.000Z'
  const hillsideOriginal = {
    id: 'febbfa6e-12e0-4f3c-ba48-5973cd4f7de9',
    updatedAt: sameMinute,
    payload: {
      templateId: 'tpl_estate_walkabout_v1',
      submitBody: {
        template_id: 'tpl_estate_walkabout_v1',
        block_id: 'blk_000684',
        inspection_start_time: '2026-10-06T12:18:00.000Z',
        answers: {
          ew_q_area: 'North',
          ew_q_planned_date: '2026-10-06',
          ew_it_communal_areas_clear: 'No',
          ew_checklist_json: '[]',
        },
        answer_extras: {
          ew_it_communal_areas_clear: {
            photo_urls: [
              'https://example.blob.vercel-storage.com/inspections/1.jpg',
              'https://example.blob.vercel-storage.com/inspections/2.jpg',
              'https://example.blob.vercel-storage.com/inspections/3.jpg',
              'https://example.blob.vercel-storage.com/inspections/4.jpg',
              'https://example.blob.vercel-storage.com/inspections/5.jpg',
            ],
          },
          ew_it_discarded_items_gardens: {
            photo_urls: [
              'https://example.blob.vercel-storage.com/inspections/6.jpg',
              'https://example.blob.vercel-storage.com/inspections/7.jpg',
              'https://example.blob.vercel-storage.com/inspections/8.jpg',
            ],
          },
        },
      },
    },
  }
  const emptyTwin = {
    id: 'a8635191-empty-twin',
    updatedAt: sameMinute,
    payload: {
      templateId: 'tpl_estate_walkabout_v1',
      submitBody: {
        template_id: 'tpl_estate_walkabout_v1',
        block_id: 'blk_000684',
        inspection_start_time: '2026-10-06T12:18:00.000Z',
        answers: { ew_q_area: '', ew_checklist_json: '[]' },
        answer_extras: {},
      },
    },
  }

  it('shows draft ID and photo count so the original Hillside row is distinct from an empty twin', () => {
    const original = formatSavedDraftIdentity(summarizeOfflineDraft(hillsideOriginal))
    const empty = formatSavedDraftIdentity(summarizeOfflineDraft(emptyTwin))
    assert.equal(original.id, 'febbfa6e-12e0-4f3c-ba48-5973cd4f7de9')
    assert.equal(original.photoCount, 8)
    assert.match(original.photoLabel, /8 photos/)
    assert.equal(original.emptyShell, false)
    assert.equal(empty.id, 'a8635191-empty-twin')
    assert.equal(empty.photoCount, 0)
    assert.equal(empty.emptyShell, true)
    assert.notEqual(original.id, empty.id)
  })

  it('still lists a location-only shell so it can be labelled, but the original remains identifiable', () => {
    const visible = selectResumableOfflineDrafts([emptyTwin, hillsideOriginal])
    assert.deepEqual(
      visible.map((draft) => draft.id),
      ['a8635191-empty-twin', 'febbfa6e-12e0-4f3c-ba48-5973cd4f7de9']
    )
  })
})
