/**
 * ESM abandoned-vehicle AVS referral preview.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/esm-abandoned-vehicle-referral.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ESM_ABANDONED_VEHICLE_AVS_EMAIL, ESM_ABANDONED_VEHICLE_HOUSING_EMAIL } from '../lib/esm-inspection-form.js'
import { mergeInspectionAnswerExtras } from '../lib/inspection-answer-extras.js'
import {
  buildEsmAbandonedVehicleAvsEmail,
  esmAbandonedVehicleReferralApplies,
  esmAbandonedVehicleReferralFieldErrors,
  isEsmAbandonedVehicleAvsReferral,
  resolveEsmAbandonedVehicleReferral,
} from '../lib/esm-abandoned-vehicle-referral.js'

const PHOTO = 'https://example.test/abandoned-vehicle.jpg'
const COMPLETE = {
  cost_code: 'HRA-2401',
  vehicle_make: 'Ford',
  vehicle_model: 'Focus',
  vehicle_registration: 'AB12 CDE',
}

function preview(overrides = {}) {
  return buildEsmAbandonedVehicleAvsEmail({
    inspectionTitle: 'ESM Inspection Form',
    locationLine: 'Chertsey Crescent 56A-76D',
    sectionTitle: '4. Abandoned Vehicles',
    questionText: 'Is there an abandoned vehicle to report?',
    answer: 'Yes',
    comment: 'Outside flat 12',
    extras: COMPLETE,
    officerName: 'James Ororo',
    photoUrls: [PHOTO],
    ...overrides,
  })
}

describe('ESM abandoned vehicle AVS email preview', () => {
  it('includes the cost code, officer, make, model, registration and vehicle photo for the AVS recipient', () => {
    const email = preview()
    assert.equal(email.ok, true)
    assert.equal(email.send, true)
    assert.equal(email.to, ESM_ABANDONED_VEHICLE_AVS_EMAIL)
    for (const detail of ['HRA-2401', 'James Ororo', 'Ford', 'Focus', 'AB12 CDE', PHOTO]) {
      assert.match(email.html, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      assert.match(email.text, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    assert.match(email.html, /Cost code/)
    assert.match(email.html, /Reporting officer/)
    assert.match(email.html, /Vehicle make/)
    assert.match(email.html, /Vehicle model/)
    assert.match(email.html, /Registration number/)
    assert.match(email.html, /Photo attached/)
  })

  it('uses the signed-in officer name when a different name was saved on the draft', () => {
    const email = preview({
      extras: { ...COMPLETE, authorisation_name: 'Someone Else' },
      officerName: 'James Ororo',
    })
    assert.match(email.text, /Reporting officer: James Ororo/)
  })

  it('uses a previously captured make when the separate make field is empty', () => {
    const email = preview({
      extras: { ...COMPLETE, vehicle_make: '', vehicle_make_model: 'Vauxhall' },
    })
    assert.equal(email.ok, true)
    assert.match(email.text, /Vehicle make: Vauxhall/)
    assert.match(email.text, /Vehicle model: Focus/)
  })

  it('does not treat the Housing Estate Services copy as the AVS referral', () => {
    assert.equal(
      isEsmAbandonedVehicleAvsReferral({
        to: ESM_ABANDONED_VEHICLE_AVS_EMAIL,
        routing: 'esm_abandoned_vehicle_yes',
      }),
      true
    )
    assert.equal(
      isEsmAbandonedVehicleAvsReferral({
        to: ESM_ABANDONED_VEHICLE_HOUSING_EMAIL,
        routing: 'esm_abandoned_vehicle_comment',
      }),
      false
    )
  })

  it('blocks the referral when a required detail is missing', () => {
    const cases = [
      { extras: { ...COMPLETE, cost_code: '' }, message: /Cost code/ },
      { officerName: '', extras: { ...COMPLETE, authorisation_name: '' }, message: /Reporting officer/ },
      { extras: { ...COMPLETE, vehicle_make: '' }, message: /Vehicle make/ },
      { extras: { ...COMPLETE, vehicle_model: '' }, message: /Vehicle model/ },
      { extras: { ...COMPLETE, vehicle_registration: '' }, message: /Registration number/ },
      { photoUrls: [], message: /Vehicle photo/ },
    ]
    for (const item of cases) {
      const email = preview(item)
      assert.equal(email.ok, false)
      assert.equal(email.send, false)
      assert.equal(email.html, '')
      assert.match(email.missing.map((gap) => gap.message).join(' '), item.message)
    }
  })

  it('resumes an older draft with a combined make/model and keeps the photo and cost code', () => {
    const question = { esm_q4_abandoned_vehicle: true }
    const savedBeforeChange = {
      vehicle_make_model: 'Ford Focus',
      cost_code: 'HRA-2401',
      photo_urls: [PHOTO],
      id_card_photo_urls: ['https://example.test/id-badge.jpg'],
      comment: 'Outside flat 12',
      vehicle_colour: 'Blue',
    }
    const resumed = { ...savedBeforeChange }
    assert.equal(resumed.vehicle_make || resumed.vehicle_make_model, 'Ford Focus')
    assert.equal(resumed.vehicle_model || '', '')
    assert.equal(resumed.vehicle_registration || '', '')
    assert.deepEqual(resumed.photo_urls, [PHOTO])
    assert.equal(resumed.cost_code, 'HRA-2401')

    const beforeCompletion = esmAbandonedVehicleReferralFieldErrors({
      question,
      answer: 'Yes',
      extras: resumed,
      officerName: 'James Ororo',
      photoUrls: resumed.photo_urls,
    })
    assert.deepEqual(
      beforeCompletion.map((gap) => gap.field),
      ['vehicle_model', 'vehicle_registration']
    )

    let completed = mergeInspectionAnswerExtras(resumed, { vehicle_make: 'Ford', vehicle_make_model: '' })
    completed = mergeInspectionAnswerExtras(completed, { vehicle_model: 'Focus' })
    completed = mergeInspectionAnswerExtras(completed, { vehicle_registration: 'AB12 CDE' })
    assert.deepEqual(completed.photo_urls, [PHOTO])
    assert.equal(completed.cost_code, 'HRA-2401')
    assert.equal(completed.vehicle_colour, 'Blue')
    assert.deepEqual(completed.id_card_photo_urls, savedBeforeChange.id_card_photo_urls)

    const afterCompletion = esmAbandonedVehicleReferralFieldErrors({
      question,
      answer: 'Yes',
      extras: completed,
      officerName: 'James Ororo',
      photoUrls: completed.photo_urls,
    })
    assert.deepEqual(afterCompletion, [])
    const email = resolveEsmAbandonedVehicleReferral({
      extras: completed,
      officerName: 'James Ororo',
      photoUrls: completed.photo_urls,
    })
    assert.equal(email.ok, true)
    assert.equal(email.make, 'Ford')
    assert.equal(email.model, 'Focus')
    assert.equal(email.registration, 'AB12 CDE')
    assert.equal(email.costCode, 'HRA-2401')
  })

  it('does not ask for vehicle details when no abandoned vehicle is reported', () => {
    const abandonedQuestion = { esm_q4_abandoned_vehicle: true }
    const otherQuestion = { esm_q4_abandoned_vehicle: false, esm_email_on_yes: 'garage.officer@croydon.gov.uk' }
    for (const answer of ['No', 'NA', '']) {
      assert.equal(esmAbandonedVehicleReferralApplies(abandonedQuestion, answer), false)
      assert.deepEqual(
        esmAbandonedVehicleReferralFieldErrors({
          question: abandonedQuestion,
          answer,
          extras: {},
          officerName: '',
          photoUrls: [],
        }),
        []
      )
    }
    assert.deepEqual(
      esmAbandonedVehicleReferralFieldErrors({
        question: otherQuestion,
        answer: 'Yes',
        extras: {},
        officerName: '',
        photoUrls: [],
      }),
      []
    )
  })

  it('names the missing detail for the officer before the referral can be sent', () => {
    const referral = resolveEsmAbandonedVehicleReferral({
      extras: { cost_code: 'HRA-2401', vehicle_make: 'Ford', vehicle_model: 'Focus' },
      officerName: 'James Ororo',
      photoUrls: [PHOTO],
    })
    assert.equal(referral.ok, false)
    assert.deepEqual(
      referral.missing.map((gap) => gap.field),
      ['vehicle_registration']
    )
    assert.match(referral.missing[0].message, /Registration number is required before the AVS referral can be sent/)
  })
})
