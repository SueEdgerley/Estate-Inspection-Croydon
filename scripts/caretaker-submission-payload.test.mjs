/**
 * Caretaker save payload: leftover photo bytes must not be posted, drafts stay
 * intact, and a 413 is not described as a role problem.
 * Run: node --import ./scripts/esm-alias-register.mjs --test --test-force-exit scripts/caretaker-submission-payload.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { omitEmbeddedPhotoDataFromSubmitBody } from '../lib/offline-photo-upload.js'
import { packNvWizardExtras } from '../lib/nv-notes-pack.js'
import {
  ROLE_CANNOT_SUBMIT_API_MESSAGE,
  ROLE_CANNOT_USE_TEMPLATE_API_MESSAGE,
  formatInspectionSaveFailureMessage,
} from '../lib/inspection-permission-messages.js'
import { alreadySubmittedInspectionReplay } from '../lib/walkabout-session-guard.js'

const PLATFORM_BODY_LIMIT = 4.5 * 1024 * 1024
const DRAFT_ID = '11111111-1111-4111-8111-111111111111'

function dataUrl(bytes) {
  return `data:image/jpeg;base64,${'A'.repeat(bytes)}`
}

function caretakerQuestion(photoBytes, blobUrl) {
  const extras = {
    comment: 'Cleaning completed',
    recipient_person_id: 'ppl_000053',
    photo_urls: [dataUrl(photoBytes)],
  }
  const packedOnce = packNvWizardExtras(extras)
  const restored = {
    ...extras,
    notes: packedOnce,
    photo_urls: [blobUrl],
  }
  return {
    ...restored,
    notes: packNvWizardExtras(restored),
  }
}

function photoHeavyCaretakerBody() {
  const answer_extras = {}
  const answers = {}
  for (let index = 0; index < 17; index += 1) {
    const questionId = `cm_canonical_cleaning_q${index + 1}`
    answers[questionId] = 'Yes'
    answer_extras[questionId] = caretakerQuestion(280000, `https://blob.example/caretaker/${questionId}.jpg`)
  }
  return {
    template_id: 'caretaker-inspection',
    block_id: 'block-1',
    answers,
    answer_extras,
  }
}

function saveRequest(body, clientInspectionId) {
  return {
    ...omitEmbeddedPhotoDataFromSubmitBody(body),
    draft: true,
    client_inspection_id: clientInspectionId,
  }
}

describe('caretaker photo save body', () => {
  it('drops embedded photo bytes and keeps the uploaded photo references', () => {
    const draft = photoHeavyCaretakerBody()
    const draftJson = JSON.stringify(draft)
    assert.ok(draftJson.length > PLATFORM_BODY_LIMIT)
    assert.match(draftJson, /data:image\/jpeg;base64,/)

    const saved = saveRequest(draft, DRAFT_ID)
    const savedJson = JSON.stringify(saved)

    assert.ok(savedJson.length < PLATFORM_BODY_LIMIT)
    assert.doesNotMatch(savedJson, /data:image\/jpeg;base64,/)
    assert.equal(saved.client_inspection_id, DRAFT_ID)
    assert.equal(saved.draft, true)

    for (const [questionId, extras] of Object.entries(saved.answer_extras)) {
      assert.equal(extras.comment, 'Cleaning completed')
      assert.equal(extras.recipient_person_id, 'ppl_000053')
      assert.deepEqual(extras.photo_urls, [`https://blob.example/caretaker/${questionId}.jpg`])
      assert.equal(extras.notes, undefined)
      const storedNotes = packNvWizardExtras(extras)
      assert.match(storedNotes, new RegExp(questionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      assert.match(storedNotes, /https:\/\/blob\.example\/caretaker\//)
      assert.doesNotMatch(storedNotes, /data:image/)
    }
  })

  it('leaves the device draft, including its photos, unchanged', () => {
    const draft = photoHeavyCaretakerBody()
    const before = JSON.stringify(draft)
    saveRequest(draft, DRAFT_ID)
    assert.equal(JSON.stringify(draft), before)
    assert.match(draft.answer_extras.cm_canonical_cleaning_q1.notes, /data:image\/jpeg;base64,/)
  })

  it('retries with the same inspection id and does not create a second submitted record', () => {
    const draft = photoHeavyCaretakerBody()
    const first = saveRequest(draft, DRAFT_ID)
    const retry = saveRequest(draft, DRAFT_ID)
    assert.equal(first.client_inspection_id, retry.client_inspection_id)
    assert.equal(JSON.stringify(first), JSON.stringify(retry))

    const replay = alreadySubmittedInspectionReplay({ id: DRAFT_ID, status: 'submitted' })
    assert.deepEqual(replay, { alreadySubmitted: true, inspectionId: DRAFT_ID })
    assert.equal(alreadySubmittedInspectionReplay({ id: DRAFT_ID, status: 'draft' }), null)
  })

  it('does not change walkabout, ESM, grounds or neighbourhood voice bodies', () => {
    const pendingPhoto = dataUrl(120)
    const walkabout = {
      template_id: 'tpl_estate_walkabout_v1',
      block_id: 'block-walkabout',
      answers: {
        ew_checklist: JSON.stringify([
          {
            id: 'item-1',
            description: 'Hall',
            photo_urls: [pendingPhoto, 'https://blob.example/walkabout.jpg'],
            action_required: true,
            action_summary: 'Repair the lock',
          },
        ]),
      },
      answer_extras: {
        ew_photo: { photo_urls: [pendingPhoto] },
      },
    }
    assert.equal(omitEmbeddedPhotoDataFromSubmitBody(walkabout), walkabout)
    assert.match(JSON.stringify(walkabout.answers), /data:image\/jpeg;base64,/)

    const esm = {
      template_id: 'esm-inspection',
      answers: { q1: 'C' },
      answer_extras: {
        q1: {
          comment: 'Damaged door',
          photo_urls: [pendingPhoto],
          id_card_photo_urls: ['https://blob.example/esm-id.jpg'],
        },
      },
    }
    assert.equal(omitEmbeddedPhotoDataFromSubmitBody(esm), esm)

    const grounds = {
      template_id: 'grounds-maintenance',
      gm_site_id: 'site-1',
      answers: { q1: 'No' },
      answer_extras: { q1: { comment: 'Bins out', photo_urls: ['https://blob.example/grounds.jpg'] } },
    }
    assert.equal(omitEmbeddedPhotoDataFromSubmitBody(grounds), grounds)

    const neighbourhoodVoice = {
      template_id: 'neighbourhood-voice',
      answers: { q1: 'Yes' },
      answer_extras: {
        q1: {
          comment: 'Spoke to the resident',
          notes: 'plain visit note that mentions data:image only as words',
          photo_urls: [pendingPhoto],
        },
      },
    }
    assert.equal(omitEmbeddedPhotoDataFromSubmitBody(neighbourhoodVoice), neighbourhoodVoice)
  })
})

describe('save failure messages', () => {
  it('describes a 413 as an oversized request and keeps the draft wording free of a role warning', () => {
    const message = formatInspectionSaveFailureMessage({
      status: 413,
      serverError: 'after your role is fixed',
      savedLocally: true,
    })
    assert.match(message, /too large to send/)
    assert.match(message, /local draft has been saved/)
    assert.doesNotMatch(message, /role/)
  })

  it('does not claim a draft was saved when the device write failed', () => {
    const message = formatInspectionSaveFailureMessage({ status: 413, savedLocally: false })
    assert.match(message, /too large to send/)
    assert.doesNotMatch(message, /local draft has been saved/)
    assert.doesNotMatch(message, /role/)
  })

  it('keeps the permission guidance for a real forbidden save', () => {
    const message = formatInspectionSaveFailureMessage({
      status: 403,
      serverError: ROLE_CANNOT_USE_TEMPLATE_API_MESSAGE,
      savedLocally: true,
    })
    assert.match(message, /does not have permission to use this form/)
    assert.match(message, /after your role is fixed/)
    assert.doesNotMatch(message, /too large to send/)

    const submitMessage = formatInspectionSaveFailureMessage({
      status: 403,
      serverError: ROLE_CANNOT_SUBMIT_API_MESSAGE,
      savedLocally: true,
    })
    assert.match(submitMessage, /does not have permission to submit this inspection type/)
    assert.match(submitMessage, /after your role is fixed/)
  })
})
