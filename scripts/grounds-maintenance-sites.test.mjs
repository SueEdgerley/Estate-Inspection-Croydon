/**
 * Grounds Maintenance site catalogue and lot grades.
 * Run: node --test scripts/grounds-maintenance-sites.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGroundsLotReport,
  buildGroundsMaintenanceCatalogue,
  groundsSiteId,
  loadGroundsMaintenanceCatalogue,
} from '../lib/grounds-maintenance-sites.js'

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
