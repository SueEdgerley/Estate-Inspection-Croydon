/**
 * Caretaker Housing Estate Services mailbox notification.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/caretaker-estates-mailbox-notification.test.mjs
 */
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CROYDON_HOUSING_LOGO_PUBLIC_PATH } from '../lib/logo-branding.js'
import {
  CARETAKER_ESTATES_MAILBOX_EMAIL,
  buildCaretakerEstatesMailboxNotification,
  caretakerEstatesMailboxInspectionFromRow,
  caretakerNotificationPublicBaseUrl,
  fieldsForCaretakerEstatesMailboxEmail,
  formatCaretakerInspectionDate,
  isCaretakerEstatesMailboxEmail,
} from '../lib/caretaker-estates-mailbox-notification.js'

const INSPECTION_ID = '8f3c1a20-6b14-4d2e-9c55-0a77e2b91d04'

function savedRow() {
  return caretakerEstatesMailboxInspectionFromRow({
    id: INSPECTION_ID,
    inspector_name: 'Priya Shah',
    person_name: 'Directory Name',
    block_name: 'Regina Court, 14 High Street',
    location_label: 'Stairwell B',
    inspection_start_time: '2026-10-08T09:30:00.000Z',
    submitted_at: '2026-10-08T11:05:00.000Z',
  })
}

describe('saved inspection identity', () => {
  it('uses the submitter name, block, and visit time from the same row', () => {
    const saved = savedRow()
    assert.equal(saved.id, INSPECTION_ID)
    assert.equal(saved.submittedBy, 'Priya Shah')
    assert.equal(saved.blockAddress, 'Regina Court, 14 High Street')
    assert.equal(formatCaretakerInspectionDate(saved.inspectionDate), 'Thu, 8 October 2026 at 10:30')
  })

  it('uses a directory name only when the saved name is an email address', () => {
    const saved = caretakerEstatesMailboxInspectionFromRow({
      id: INSPECTION_ID,
      inspector_name: 'priya.shah@croydon.gov.uk',
      person_name: 'Priya Shah',
      block_name: 'Regina Court, 14 High Street',
    })
    assert.equal(saved.submittedBy, 'Priya Shah')
  })

  it('does not pair another inspection’s name or block with this report link', () => {
    const other = caretakerEstatesMailboxInspectionFromRow({
      id: 'other-inspection',
      inspector_name: 'Other Person',
      block_name: 'Other Block',
      inspection_start_time: '2026-01-01T00:00:00.000Z',
    })
    const fields = fieldsForCaretakerEstatesMailboxEmail(other, INSPECTION_ID, {
      submittedBy: 'Priya Shah',
      blockAddress: 'Regina Court, 14 High Street',
      inspectionDate: '2026-10-08T09:30:00.000Z',
    })
    assert.equal(fields.sameInspection, false)
    assert.equal(fields.inspectionId, INSPECTION_ID)
    assert.equal(fields.submittedBy, 'Priya Shah')
    assert.equal(fields.blockAddress, 'Regina Court, 14 High Street')

    const matched = fieldsForCaretakerEstatesMailboxEmail(savedRow(), INSPECTION_ID, {
      submittedBy: 'Other Person',
      blockAddress: 'Other Block',
      inspectionDate: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(matched.sameInspection, true)
    assert.equal(matched.submittedBy, 'Priya Shah')
    assert.equal(matched.blockAddress, 'Regina Court, 14 High Street')
    assert.equal(formatCaretakerInspectionDate(matched.inspectionDate), 'Thu, 8 October 2026 at 10:30')
  })
})

describe('estates mailbox email', () => {
  const saved = savedRow()
  const email = buildCaretakerEstatesMailboxNotification({
    inspectionId: saved.id,
    submittedBy: saved.submittedBy,
    blockAddress: saved.blockAddress,
    inspectionDate: saved.inspectionDate,
    sectionTitle: '2. External Cleaning - Cleaning completed for ...',
    questionText: 'Fly Tipping',
    answer: '',
    comment: 'Black bags beside the bin store',
    photoUrls: ['https://example.blob.core.windows.net/photos/fly-tip.jpg'],
    baseUrl: 'https://estateinspections.co.uk',
  })

  it('builds the filterable subject from that inspection', () => {
    assert.equal(
      email.subject,
      'Caretaker inspection | Priya Shah | Regina Court, 14 High Street | Fly Tipping'
    )
  })

  it('links the report and the council logo to the public app for this inspection', () => {
    const reportUrl = `https://estateinspections.co.uk/inspections/${INSPECTION_ID}`
    assert.equal(email.reportUrl, reportUrl)
    assert.equal(email.logoUrl, `https://estateinspections.co.uk${CROYDON_HOUSING_LOGO_PUBLIC_PATH}`)
    assert.match(email.html, new RegExp(`href="${reportUrl}"`))
    assert.match(email.html, /View full inspection report/)
    assert.match(email.html, new RegExp(`src="${email.logoUrl}"`))
    assert.match(email.text, new RegExp(`View full inspection report: ${reportUrl}`))
    assert.doesNotMatch(email.logoUrl, /vercel\.app|localhost|\.api/i)
  })

  it('shows a saved Yes, No, or NA answer, and a dash only when none was saved', () => {
    for (const savedAnswer of ['Yes', 'No', 'NA']) {
      const withAnswer = buildCaretakerEstatesMailboxNotification({
        inspectionId: saved.id,
        submittedBy: saved.submittedBy,
        blockAddress: saved.blockAddress,
        questionText: 'Fly Tipping',
        answer: savedAnswer,
        comment: 'Black bags beside the bin store',
      })
      assert.match(withAnswer.html, new RegExp(`>Answer</td><td[^>]*>${savedAnswer}</td>`))
      assert.match(withAnswer.text, new RegExp(`Answer: ${savedAnswer}`))
    }
    assert.match(email.text, /Answer: —/)
    assert.match(email.html, /Answer<\/td><td[^>]*>—<\/td>/)
  })

  it('includes the saved question details and does not add an area', () => {
    for (const body of [email.html, email.text]) {
      assert.match(body, /Priya Shah/)
      assert.match(body, /Regina Court, 14 High Street/)
      assert.match(body, /Thu, 8 October 2026 at 10:30/)
      assert.match(body, /2\. External Cleaning - Cleaning completed for \.\.\./)
      assert.match(body, /Fly Tipping/)
      assert.match(body, /Black bags beside the bin store/)
      assert.match(body, /https:\/\/example\.blob\.core\.windows\.net\/photos\/fly-tip\.jpg/)
      assert.doesNotMatch(body, />\s*Area\s*</)
      assert.doesNotMatch(body, /^Area:/m)
    }
    assert.match(email.text, /Answer: —/)
    assert.match(email.text, /Comments: Black bags beside the bin store/)
  })

  it('corrects a malformed app URL before building the logo and report links', () => {
    const origin = caretakerNotificationPublicBaseUrl({
      NEXT_PUBLIC_APP_URL: 'https://estateinspections.co.uk.api:443',
      APP_URL: '',
    })
    assert.equal(origin, 'https://estateinspections.co.uk')
    const corrected = buildCaretakerEstatesMailboxNotification({
      inspectionId: INSPECTION_ID,
      submittedBy: 'Priya Shah',
      blockAddress: 'Regina Court, 14 High Street',
      questionText: 'Fly Tipping',
      baseUrl: 'https://estate-inspection.vercel.app.api:443/croydon-housing-logo.png',
    })
    assert.equal(corrected.logoUrl, 'https://estate-inspection.vercel.app/croydon-housing-logo.png')
    assert.equal(
      corrected.reportUrl,
      `https://estate-inspection.vercel.app/inspections/${INSPECTION_ID}`
    )
  })

  it('is only for the existing estates mailbox', () => {
    assert.equal(isCaretakerEstatesMailboxEmail('HousingEstateServices@croydon.gov.uk'), true)
    assert.equal(isCaretakerEstatesMailboxEmail('simon.roice@croydon.gov.uk'), false)
    assert.equal(isCaretakerEstatesMailboxEmail('Tenancy.Service@croydon.gov.uk'), false)
    assert.equal(isCaretakerEstatesMailboxEmail('internalhousingrepairs@croydon.gov.uk'), false)
    assert.equal(isCaretakerEstatesMailboxEmail('caretaker@croydon.gov.uk'), false)
    assert.equal(CARETAKER_ESTATES_MAILBOX_EMAIL, 'housingestateservices@croydon.gov.uk')
  })
})

describe('send paths', () => {
  const files = [
    'app/api/inspections/route.js',
    'app/api/inspections/[id]/submit/route.js',
  ]

  for (const file of files) {
    it(`${file} keeps the mailbox recipient and uses the new content only for that recipient`, () => {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      assert.match(source, /const CARETAKER_SECTION_2_EMAIL = 'housingestateservices@croydon\.gov\.uk'/)
      assert.match(source, /const CARETAKER_SECTION_3_EMAIL = 'Tenancy\.Service@croydon\.gov\.uk'/)
      assert.match(source, /const CARETAKER_SECTION_5_EMAIL = 'simon\.roice@croydon\.gov\.uk'/)
      assert.match(source, /const CARETAKER_SECTION_6_EMAIL = 'internalhousingrepairs@croydon\.gov\.uk'/)
      assert.match(source, /isCaretakerEstatesMailboxEmail\(to, CARETAKER_SECTION_2_EMAIL\)/)
      assert.match(source, /if \(estatesMailbox\) \{\s*const content = buildCaretakerEstatesMailboxNotification/)
      assert.match(source, /let subject = `Caretaker inspection: \$\{/)
      assert.doesNotMatch(source, /caretaker manager|area boundaries/i)
    })
  }
})
