/**
 * Grounds Maintenance site catalogue and lot grades.
 * Run: node --test scripts/grounds-maintenance-sites.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildGroundsLotReport,
  buildGroundsMaintenanceCatalogue,
  groundsMaintenanceLocationError,
  groundsSiteId,
  loadGroundsMaintenanceCatalogue,
} from '../lib/grounds-maintenance-sites.js'
import { draftHasOfficerProgress } from '../lib/offline-inspection-drafts.js'
import { resumeDraftHasMeaningfulContent } from '../lib/inspection-resume-draft.js'

const PALMA_SITE_ID = 'gm:2:SI/000001411'

function featureRow(lotNumber, siteReference, siteName, featureDescription) {
  return {
    lotNumber,
    siteReference,
    siteName,
    featureCode: 'GR1',
    featureDescription,
    squareMetres: '10',
    linear: '',
    ward: 'Thornton Heath',
    category: 'Housing',
  }
}

describe('grounds maintenance site import', () => {
  it('keeps one site per lot and reference and stores repeated features on that site', () => {
    const catalogue = buildGroundsMaintenanceCatalogue([
      featureRow(1, 'SI/000000010', 'Atlanta Court', 'SHRUB BEDS'),
      featureRow(1, 'SI/000000010', 'Atlanta Court', 'GRASS AREAS'),
      featureRow(4, 'SI/000000509', 'Brookhurst Court', 'SHRUB BEDS'),
    ])

    assert.equal(catalogue.writtenToProduction, false)
    assert.equal(catalogue.sites.length, 2)
    const atlanta = catalogue.sites.find((site) => site.siteReference === 'SI/000000010')
    assert.equal(atlanta.id, groundsSiteId(1, 'SI/000000010'))
    assert.equal(atlanta.features.length, 2)
    assert.equal(atlanta.contractor, 'Krinkels')
    const brookhurst = catalogue.sites.find((site) => site.id === groundsSiteId(4, 'SI/000000509'))
    assert.equal(brookhurst.lotLabel, 'Lot 4 – Extra Care Schemes & Hostels')
    assert.equal(brookhurst.contractor, 'Greener Solutions')
    assert.equal(Object.hasOwn(brookhurst, 'blockId'), false)
  })

  it('flags conflicting names and references without merging distinct references', () => {
    const catalogue = buildGroundsMaintenanceCatalogue([
      featureRow(1, 'SI/000000010', 'Atlanta Court', 'SHRUB BEDS'),
      featureRow(1, 'SI/000000010', 'Atlanta Court Parchmore', 'GRASS AREAS'),
      featureRow(1, 'SI/000000011', 'Atlanta Court', 'HEDGES'),
      { lotNumber: 4, rowNumber: 20, siteReference: 'Truscott House', siteName: '14 Stanley Grove' },
    ])

    assert.equal(catalogue.sites.length, 2)
    assert.ok(catalogue.conflicts.some((item) => item.type === 'conflicting_site_name'))
    assert.ok(catalogue.conflicts.some((item) => item.type === 'conflicting_site_reference'))
    assert.ok(catalogue.conflicts.some((item) => item.type === 'missing_site_reference' && item.siteReference === 'Truscott House'))
  })

  it('labels lot 3 as Cleanscapes and leaves its area name pending', () => {
    const catalogue = loadGroundsMaintenanceCatalogue()
    const lot3 = catalogue.lots.find((lot) => lot.id === 'lot-3')
    assert.equal(lot3.label, 'Lot 3 – Cleanscapes')
    assert.equal(lot3.contractor, 'Cleanscapes')
    assert.equal(lot3.areaNamePending, true)
    assert.equal(catalogue.writtenToProduction, false)
    assert.ok(catalogue.sites.some((site) => site.lotId === 'lot-4'))
    assert.ok(catalogue.sites.every((site) => site.siteReference.startsWith('SI/')))
    assert.equal(new Set(catalogue.sites.map((site) => site.id)).size, catalogue.sites.length)
  })
})

describe('grounds maintenance lot grades', () => {
  const catalogue = buildGroundsMaintenanceCatalogue([
    featureRow(4, 'SI/000000509', 'Brookhurst Court', 'SHRUB BEDS'),
    featureRow(1, 'SI/000000010', 'Atlanta Court', 'GRASS AREAS'),
  ])

  it('counts a repeat visit as another inspection and one site grade', () => {
    const siteId = groundsSiteId(4, 'SI/000000509')
    const report = buildGroundsLotReport({
      catalogue,
      inspections: [
        { id: 'i1', gmSiteId: siteId, a: 0, b: 2, c: 0, d: 0 },
        { id: 'i2', gmSiteId: siteId, a: 0, b: 0, c: 7, d: 1 },
      ],
    })

    assert.equal(report.completedInspections, 2)
    assert.equal(report.distinctSites, 1)
    const lot4 = report.lots.find((lot) => lot.id === 'lot-4')
    assert.equal(lot4.completedInspections, 2)
    assert.equal(lot4.distinctSites, 1)
    assert.equal(lot4.sites[0].overallGrade, 'C')
    assert.deepEqual(
      lot4.grades.map((grade) => grade.count),
      [0, 0, 1, 0, 0]
    )
  })

  it('counts a shared site once when it covers several blocks', () => {
    const siteId = groundsSiteId(1, 'SI/000000010')
    const report = buildGroundsLotReport({
      catalogue,
      links: [
        { siteId, blockId: 'b1', blockName: 'Block A', estateId: 'e1', estateName: 'Atlanta Estate' },
        { siteId, blockId: 'b2', blockName: 'Block B', estateId: 'e1', estateName: 'Atlanta Estate' },
      ],
      inspections: [{ id: 'i1', gmSiteId: siteId, a: 4, b: 0, c: 0, d: 0 }],
    })
    const site = report.lots.find((lot) => lot.id === 'lot-1').sites[0]
    assert.equal(report.distinctSites, 1)
    assert.equal(site.overallGrade, 'A')
    assert.equal(site.coverage.blocks.length, 2)
    assert.equal(site.coverage.estates.length, 1)
    assert.match(site.coverage.label, /Atlanta Estate/)
  })

  it('places a submitted grounds site with no block under its lot and contractor', () => {
    const catalogue = loadGroundsMaintenanceCatalogue()
    const report = buildGroundsLotReport({
      catalogue,
      inspections: [
        {
          id: 'resumed-draft',
          gmSiteId: PALMA_SITE_ID,
          blockId: null,
          locationLabel: '122 to 140 King Henrys Drive',
          a: 8,
          b: 0,
          c: 0,
          d: 0,
        },
      ],
    })
    const lot2 = report.lots.find((lot) => lot.id === 'lot-2')
    const site = lot2.sites.find((row) => row.siteId === PALMA_SITE_ID)
    const unassigned = report.lots.find((lot) => lot.id === 'unassigned')
    assert.equal(lot2.label, 'Lot 2 – East Croydon')
    assert.equal(lot2.contractor, 'Krinkels')
    assert.equal(site.siteName, '122 to 140 King Henrys Drive')
    assert.equal(site.inspectionCount, 1)
    assert.equal(site.overallGrade, 'A')
    assert.equal(unassigned.sites.length, 0)
  })

  it('keeps an unclear historic inspection visible under Unassigned lot', () => {
    const report = buildGroundsLotReport({
      catalogue,
      inspections: [
        { id: 'old-1', locationLabel: 'Rear gardens', blockName: 'Rear gardens', a: 0, b: 0, c: 0, d: 1 },
        { id: 'old-2', locationLabel: 'Rear gardens', blockName: 'Rear gardens', a: 0, b: 0, c: 1, d: 0 },
      ],
    })
    const unassigned = report.lots.find((lot) => lot.id === 'unassigned')
    assert.equal(report.completedInspections, 2)
    assert.equal(report.distinctSites, 1)
    assert.equal(unassigned.sites.length, 1)
    assert.equal(unassigned.sites[0].needsMapping, true)
    assert.equal(unassigned.sites[0].recordedLocation, 'Rear gardens')
    assert.equal(unassigned.sites[0].inspectionCount, 2)
    assert.equal(unassigned.sites[0].overallGrade, 'D')
  })
})

describe('grounds maintenance location requirement', () => {
  it('accepts a new inspection that has a grounds site and no block', () => {
    assert.equal(groundsMaintenanceLocationError({ blockId: null, gmSiteId: PALMA_SITE_ID }), null)
  })

  it('accepts a resumed draft that saved the same site and no block', () => {
    assert.equal(
      groundsMaintenanceLocationError({
        blockId: '',
        gmSiteId: PALMA_SITE_ID,
      }),
      null
    )
    const payload = {
      submitBody: {
        template_id: 'recMOQSaY7Z16SYDM',
        gm_site_id: PALMA_SITE_ID,
        answers: { q1: 'A', q2: 'A', q3: 'B', q4: 'B', q5: 'A', q6: 'B', q7: 'A', q8: 'B' },
      },
    }
    assert.equal(resumeDraftHasMeaningfulContent(payload), true)
    assert.equal(draftHasOfficerProgress(payload), true)
  })

  it('still requires a location when a grounds inspection has neither a site nor a block', () => {
    assert.equal(groundsMaintenanceLocationError({ blockId: null, gmSiteId: null }), 'Location is required')
    assert.equal(
      groundsMaintenanceLocationError({ blockId: null, gmSiteId: 'gm:2:SI/missing' }),
      'Choose a Grounds Maintenance site from the site list'
    )
  })

  it('still accepts an older grounds inspection saved against a block only', () => {
    assert.equal(groundsMaintenanceLocationError({ blockId: 'blk_000545', gmSiteId: null }), null)
  })

  it('keeps caretaker and ESM submissions on the block check', () => {
    const source = readFileSync(new URL('../app/api/inspections/[id]/submit/route.js', import.meta.url), 'utf8')
    assert.match(source, /groundsMaintenanceLocationError\(\{/)
    assert.match(source, /isCaretakerTemplate\(templateForRoleCheck\)/)
    assert.match(source, /isEsmInspectionFormTemplate\(templateForRoleCheck\)/)
    assert.match(source, /!String\(inspection\.block_id \|\| ''\)\.trim\(\)/)
    const groundsAt = source.indexOf('if (isGroundsMaintenanceSubmission)')
    const groundsBranch = source.slice(groundsAt, source.indexOf('} else if (', groundsAt))
    assert.match(groundsBranch, /groundsMaintenanceLocationError/)
    assert.doesNotMatch(groundsBranch, /isCaretakerTemplate|isEsmInspectionFormTemplate/)
  })
})
