/**
 * Resume must open the saved Walkabout on the form, not only list it.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-resume-restore.test.mjs
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getInspectionDraftResumeHref,
  readOfflineInspectionDrafts,
  upsertOfflineInspectionDraft,
} from '../lib/offline-inspection-drafts.js'
import {
  buildWalkaboutFormStateFromDraft,
  formatRestoredWalkaboutBanner,
  isWalkaboutOfflineDraft,
  shouldWriteWalkaboutDraftAfterRestore,
  walkaboutResumeMustPassDraftToChild,
} from '../lib/walkabout-draft-restore.js'

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

const ANDY_HILLSIDE_ID = 'febbfa6e-12e0-4f3c-ba48-5973cd4f7de9'

function hillsideDraft() {
  return {
    id: ANDY_HILLSIDE_ID,
    label: 'Estate Walkabout',
    payload: {
      templateId: 'tpl_estate_walkabout_v1',
      templateName: 'Estate Walkabout',
      locationLabel: 'Hillside House',
      submitBody: {
        template_id: 'tpl_estate_walkabout_v1',
        block_id: 'blk_000684',
        inspection_start_time: '2026-10-06T12:18:00.000Z',
        answers: {
          ew_q_area: 'North',
          ew_q_planned_date: '2026-10-06',
          ew_q_responsible: 'person_444a5a013a60486d',
          ew_it_communal_areas_clear: 'No',
          ew_it_discarded_items_gardens: 'Yes',
          ew_ec_paving_grade: 'A',
          ew_os_overall_grade: 'A',
          ew_st_esm_present: 'No',
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
}

describe('Walkabout Resume restore mapping', () => {
  it('maps the listed Hillside draft onto visible form fields and photographs', () => {
    const restored = buildWalkaboutFormStateFromDraft(hillsideDraft())
    assert.equal(restored.id, ANDY_HILLSIDE_ID)
    assert.equal(restored.postgresBlockId, 'blk_000684')
    assert.equal(restored.answers.ew_q_area, 'North')
    assert.equal(restored.answers.ew_q_planned_date, '2026-10-06')
    assert.equal(restored.answers.ew_it_communal_areas_clear, 'No')
    assert.equal(restored.answers.ew_ec_paving_grade, 'A')
    assert.equal(restored.answerExtras.ew_it_communal_areas_clear.photo_urls.length, 5)
    assert.equal(restored.answerExtras.ew_it_discarded_items_gardens.photo_urls.length, 3)
    assert.equal(restored.photoCount, 8)
    assert.equal(restored.filledAnswerCount >= 7, true)
    assert.equal(restored.locationLabel, 'Hillside House')
  })

  it('treats Andy’s original as a Walkabout that the child form must receive', () => {
    const draft = hillsideDraft()
    assert.equal(isWalkaboutOfflineDraft(draft), true)
    assert.equal(walkaboutResumeMustPassDraftToChild(draft), true)
  })

  it('documents that parent-applied answers are discarded unless passed to Walkabout', () => {
    const draft = hillsideDraft()
    const parentAppliedAnswers = draft.payload.submitBody.answers
    const emptyWalkaboutChild = { ew_q_area: '' }
    assert.equal(parentAppliedAnswers.ew_q_area, 'North')
    assert.equal(emptyWalkaboutChild.ew_q_area, '')
    const childGivenDraft = buildWalkaboutFormStateFromDraft(draft)
    assert.equal(childGivenDraft.answers.ew_q_area, 'North')
    assert.equal(childGivenDraft.postgresBlockId, 'blk_000684')
  })

  it('includes draft_id on the Resume URL so a remount can restore the same inspection', () => {
    const href = getInspectionDraftResumeHref(hillsideDraft())
    assert.equal(
      href,
      `/inspections/new?template_id=tpl_estate_walkabout_v1&draft_id=${ANDY_HILLSIDE_ID}`
    )
  })

  it('does not write localStorage when mapping a draft onto form state', () => {
    installMemoryStorage()
    const draft = hillsideDraft()
    upsertOfflineInspectionDraft(draft)
    const before = JSON.stringify(readOfflineInspectionDrafts())
    buildWalkaboutFormStateFromDraft(draft)
    assert.equal(JSON.stringify(readOfflineInspectionDrafts()), before)
    assert.equal(readOfflineInspectionDrafts()[0].id, ANDY_HILLSIDE_ID)
    assert.equal(readOfflineInspectionDrafts()[0].payload.submitBody.answers.ew_q_area, 'North')
  })

  it('does not rebuild and save the original draft until the officer edits', () => {
    assert.equal(shouldWriteWalkaboutDraftAfterRestore({ restoredUnedited: true, officerEdited: false }), false)
    assert.equal(shouldWriteWalkaboutDraftAfterRestore({ restoredUnedited: true, officerEdited: true }), true)
  })

  it('tells the officer the inspection was restored instead of only scrolling to the top', () => {
    const restored = buildWalkaboutFormStateFromDraft(hillsideDraft())
    const banner = formatRestoredWalkaboutBanner(restored)
    assert.match(banner, /Hillside House/)
    assert.match(banner, /8 photograph/)
    assert.match(banner, /loaded from this phone/)
  })

  it('leaves Caretaker Resume href on the Caretaker template', () => {
    const href = getInspectionDraftResumeHref({
      id: 'caretaker-1',
      label: 'Caretaker Inspection',
      payload: { templateId: 'tpl_caretaker_v1', submitBody: { template_id: 'tpl_caretaker_v1' } },
    })
    assert.equal(href, '/inspections/new?template_id=tpl_caretaker_v1&draft_id=caretaker-1')
    assert.equal(
      isWalkaboutOfflineDraft({
        id: 'caretaker-1',
        payload: { templateId: 'tpl_caretaker_v1' },
      }),
      false
    )
  })
})
