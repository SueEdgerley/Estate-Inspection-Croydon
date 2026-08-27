/**
 * Walkabout Resident Poster redesign checks.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/walkabout-resident-poster-redesign.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildWalkaboutResidentPosterPdf } from '../lib/pdf/buildWalkaboutResidentPosterPdf.js'

function countEmbeddedImages(pdfDoc) {
  let jpeg = 0
  let png = 0
  pdfDoc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return
    try {
      const subtype = obj.dict.get(PDFName.of('Subtype'))
      if (!subtype || subtype.toString() !== '/Image') return
      const filter = String(obj.dict.get(PDFName.of('Filter')) || '')
      if (filter.includes('DCTDecode')) jpeg += 1
      else png += 1
    } catch {
      // ignore
    }
  })
  return { jpeg, png }
}

const inspection = {
  estate_block_name: 'Windmill Bridge House',
  location_label: 'Windmill Bridge House',
  title: 'Estate Walkabout',
  submitted_at: '2026-08-05T09:48:39.368Z',
  inspector_name: 'Izabela Saxton',
}

function item(partial) {
  return {
    item_text: 'Issue',
    comment: 'Action',
    location: 'Windmill Bridge House',
    status: 'open',
    job_number: '',
    expected_completion_date: '',
    photo_urls: [],
    created_at: '2026-08-05T09:48:39.000Z',
    ...partial,
  }
}

describe('Walkabout Resident Poster redesign', () => {
  it('paginates issue cards and does not embed extra photos from multi-photo items', async () => {
    const items = [
      item({ item_text: 'Water damage to plaster under roof hatches', comment: 'Check for leaks', status: 'open', photo_urls: [] }),
      item({ item_text: 'Windows handle missing', comment: 'Request replacement', status: 'open', photo_urls: ['https://example.invalid/one.jpg'] }),
      item({
        item_text: 'Personal items in communal area',
        comment: 'Write to residents and seek removal - communal area cleared',
        status: 'completed',
        photo_urls: ['https://example.invalid/a.jpg', 'https://example.invalid/b.jpg', 'https://example.invalid/c.jpg'],
      }),
      item({ item_text: 'Lights not turning on', comment: 'Instructions repairs', status: 'in_progress' }),
      item({ item_text: 'Mould and water damage', comment: 'Check for leaks make good damage', status: 'open' }),
      item({ item_text: 'Many old items in communal room', comment: 'Remove unwanted items', status: 'open' }),
      item({ item_text: 'Fire extinguisher in communal room', comment: 'Remove if not tested', status: 'open' }),
      item({
        item_text: 'Very long wrapping issue title that should not overlap neighbouring fields on the card',
        comment: 'A longer action update that also needs to wrap onto several lines without leaving the card.',
        status: 'open',
      }),
    ]
    const bytes = await buildWalkaboutResidentPosterPdf({ inspection, items })
    const pdf = await PDFDocument.load(bytes)
    const images = countEmbeddedImages(pdf)

    assert.ok(pdf.getPageCount() >= 2, 'enough issues should flow onto a second page')
    assert.ok(bytes.length > 20000, 'poster PDF should contain branding and page content')
    assert.equal(images.jpeg, 0, 'failed example photo URLs must not embed extra images')
    assert.ok(images.png >= 1, 'Croydon logo should still embed')
    assert.equal(items.filter((row) => row.photo_urls.length > 1)[0].photo_urls.length, 3)
  })
})
