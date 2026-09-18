/**
 * Bulk inspection report ZIP helpers and access rules.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/inspection-report-zip.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_BULK_PDF_IDS,
  buildBulkZipFilename,
  buildInspectionPdfFilename,
  formatBulkPdfZipMessage,
  normalizeBulkPdfIds,
  partitionBulkPdfAccess,
} from '../lib/inspection-report-zip.js'
import { buildZipArchive, countZipEntries, listZipEntryNames } from '../lib/zip-store.js'
import { buildOwnRecordIdentity } from '../lib/own-record-scope.js'

const HO_A = buildOwnRecordIdentity({
  emails: ['officer.a@croydon.gov.uk'],
  peopleIds: ['person-a'],
  clerkIds: ['user_a'],
  airtableIds: ['recAAAA1111'],
  clerkUserId: 'user_a',
})

describe('normalizeBulkPdfIds', () => {
  it('keeps the selected order, drops blanks and duplicates', () => {
    assert.deepEqual(normalizeBulkPdfIds([' b ', 'a', 'b', '', 'c']), ['b', 'a', 'c'])
  })
})

describe('filenames', () => {
  it('builds a UK-dated ZIP name', () => {
    assert.equal(buildBulkZipFilename(new Date('2026-09-18T12:00:00.000Z')), 'inspection-reports-18-09-2026.zip')
  })

  it('sanitises block names into useful PDF filenames', () => {
    const used = new Set()
    const name = buildInspectionPdfFilename(
      { block_name: 'Longheath Gardens 279-288', submitted_at: '2026-07-10T09:00:00.000Z' },
      used
    )
    assert.equal(name, 'Longheath-Gardens-279-288-10-07-2026.pdf')
  })

  it('avoids duplicate filenames for the same block and date', () => {
    const used = new Set()
    const first = buildInspectionPdfFilename(
      { block_name: 'Longheath Gardens 279-288', submitted_at: '2026-07-10' },
      used
    )
    const second = buildInspectionPdfFilename(
      { block_name: 'Longheath Gardens 279-288', submitted_at: '2026-07-10' },
      used
    )
    assert.equal(first, 'Longheath-Gardens-279-288-10-07-2026.pdf')
    assert.equal(second, 'Longheath-Gardens-279-288-10-07-2026-2.pdf')
  })
})

describe('zip contents from the selected set', () => {
  it('select 1 → ZIP contains 1 PDF', () => {
    const used = new Set()
    const zip = buildZipArchive([
      {
        name: buildInspectionPdfFilename({ block_name: 'One Block', submitted_at: '2026-09-18T12:00:00.000Z' }, used),
        bytes: Buffer.from('%PDF-1.4 one'),
      },
    ])
    assert.equal(countZipEntries(zip), 1)
  })

  it('select 12 → ZIP contains exactly those 12 reports', () => {
    const used = new Set()
    const ids = Array.from({ length: 12 }, (_, i) => `insp-${i + 1}`)
    const files = ids.map((id, index) => ({
      name: buildInspectionPdfFilename(
        {
          id,
          block_name: index % 2 === 0 ? `Block ${index + 1}` : `Walkabout ${index + 1}`,
          submitted_at: `2026-09-${String((index % 27) + 1).padStart(2, '0')}T12:00:00.000Z`,
        },
        used
      ),
      bytes: Buffer.from(`%PDF-1.4 ${id}`),
    }))
    const zip = buildZipArchive(files)
    const names = listZipEntryNames(zip)
    assert.equal(countZipEntries(zip), 12)
    assert.equal(names.length, 12)
    assert.equal(new Set(names).size, 12)
  })

  it('includes selected records across different forms as separate PDFs', () => {
    const used = new Set()
    const rows = [
      { id: 'walk', block_name: 'Alford Green 1-27', submitted_at: '2026-09-01T12:00:00.000Z' },
      { id: 'caretaker', block_name: 'Bygrove 1-24', submitted_at: '2026-09-02T12:00:00.000Z' },
      { id: 'grounds', block_name: 'Walton Green 80-102', submitted_at: '2026-09-03T12:00:00.000Z' },
    ]
    const zip = buildZipArchive(
      rows.map((row) => ({
        name: buildInspectionPdfFilename(row, used),
        bytes: Buffer.from(`%PDF-1.4 ${row.id}`),
      }))
    )
    assert.equal(countZipEntries(zip), 3)
  })
})

describe('failure messaging', () => {
  it('does not claim 12 downloaded unless all 12 are in the ZIP', () => {
    assert.equal(
      formatBulkPdfZipMessage({ requested: 12, included: 12, failed: 0 }),
      '12 of 12 reports downloaded.'
    )
    assert.equal(
      formatBulkPdfZipMessage({ requested: 12, included: 11, failed: 1 }),
      '11 of 12 reports downloaded. 1 report could not be generated.'
    )
  })
})

describe('authorisation', () => {
  it('lets a Housing Officer keep only their own selected inspections', () => {
    const { allowed, failed } = partitionBulkPdfAccess(
      { scopeOwn: true, identity: HO_A },
      ['own-1', 'other-1', 'missing-1'],
      [
        { id: 'own-1', inspector_id: 'officer.a@croydon.gov.uk', block_name: 'A' },
        { id: 'other-1', inspector_id: 'officer.b@croydon.gov.uk', block_name: 'B' },
      ]
    )
    assert.deepEqual(allowed.map((row) => row.id), ['own-1'])
    assert.equal(failed.find((row) => row.id === 'other-1')?.reason, 'not_authorised')
    assert.equal(failed.find((row) => row.id === 'missing-1')?.reason, 'not_found')
  })

  it('lets a manager/admin keep every selected inspection that exists', () => {
    const { allowed, failed } = partitionBulkPdfAccess(
      { scopeOwn: false, identity: null },
      ['a', 'b'],
      [
        { id: 'a', inspector_id: 'officer.a@croydon.gov.uk' },
        { id: 'b', inspector_id: 'officer.b@croydon.gov.uk' },
      ]
    )
    assert.deepEqual(allowed.map((row) => row.id), ['a', 'b'])
    assert.equal(failed.length, 0)
  })

  it('still selects historic inspections that have no full_pdf_url yet', () => {
    const { allowed, failed } = partitionBulkPdfAccess(
      { scopeOwn: false, identity: null },
      ['historic-1'],
      [{ id: 'historic-1', inspector_id: 'officer.a@croydon.gov.uk', full_pdf_url: null }]
    )
    assert.equal(allowed.length, 1)
    assert.equal(failed.length, 0)
  })
})

describe('selection is not the filter set', () => {
  it('normalises only the IDs posted, not a wider matching list', () => {
    const matchingFilterIds = Array.from({ length: 40 }, (_, i) => `m-${i}`)
    const selected = matchingFilterIds.slice(0, 12)
    assert.equal(normalizeBulkPdfIds(selected).length, 12)
    assert.notEqual(normalizeBulkPdfIds(selected).length, matchingFilterIds.length)
  })

  it('caps abuse-sized payloads', () => {
    assert.ok(MAX_BULK_PDF_IDS >= 40)
  })
})
