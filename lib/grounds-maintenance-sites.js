import { readFileSync } from 'fs'
import { join } from 'path'
import {
  equalWeightGradeScore,
  scoreToGrade,
  summariseBlockOverallGrades,
} from './analytics-grade-summary.js'

/**
 * Grounds Maintenance sites come from the numbered lot tabs in
 * Grounds Maintenance Site Lists. One site per lot and spreadsheet
 * site reference. Feature rows describe what is maintained there.
 * This catalogue is a local preview. It is not written to production.
 */

export const UNASSIGNED_LOT_ID = 'unassigned'
export const UNASSIGNED_LOT_LABEL = 'Unassigned lot'

export const GROUNDS_LOTS = [
  {
    id: 'lot-1',
    number: 1,
    label: 'Lot 1 – North Croydon',
    contractor: 'Krinkels',
    areaName: 'North Croydon',
    areaNamePending: false,
  },
  {
    id: 'lot-2',
    number: 2,
    label: 'Lot 2 – East Croydon',
    contractor: 'Krinkels',
    areaName: 'East Croydon',
    areaNamePending: false,
  },
  {
    id: 'lot-3',
    number: 3,
    label: 'Lot 3 – Cleanscapes',
    contractor: 'Cleanscapes',
    areaName: null,
    areaNamePending: true,
    areaNameNote:
      'Pending confirmation of the area name. The workbook tab says South Croydon and the sheet header says East Croydon.',
  },
  {
    id: 'lot-4',
    number: 4,
    label: 'Lot 4 – Extra Care Schemes & Hostels',
    contractor: 'Greener Solutions',
    areaName: 'Extra Care Schemes & Hostels',
    areaNamePending: false,
  },
]

const LOTS_BY_NUMBER = new Map(GROUNDS_LOTS.map((lot) => [lot.number, lot]))

export function groundsLotByNumber(lotNumber) {
  return LOTS_BY_NUMBER.get(Number(lotNumber)) || null
}

export function groundsSiteId(lotNumber, siteReference) {
  return `gm:${Number(lotNumber)}:${String(siteReference || '').trim()}`
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function norm(value) {
  return clean(value).toLowerCase()
}

function featureKey(feature) {
  return [feature.code, feature.description, feature.squareMetres, feature.linear].map(norm).join('|')
}

function isWorkbookNote(siteReference, siteName) {
  const text = `${siteReference} ${siteName}`.toLowerCase()
  return (
    text.includes('total lot') ||
    text.includes('for information purposes') ||
    text.includes('does not have measurements') ||
    text.includes('schedule of rates') ||
    norm(siteReference) === 'development' ||
    norm(siteName) === 'building name' ||
    norm(siteName) === 'address line 1'
  )
}

function countGrades(inspections) {
  return inspections.reduce(
    (totals, inspection) => {
      totals.a += Number(inspection.a) || 0
      totals.b += Number(inspection.b) || 0
      totals.c += Number(inspection.c) || 0
      totals.d += Number(inspection.d) || 0
      return totals
    },
    { a: 0, b: 0, c: 0, d: 0 }
  )
}

function gradeFromCounts(counts) {
  const gradedAnswers = counts.a + counts.b + counts.c + counts.d
  const avgScore = equalWeightGradeScore(counts.a, counts.b, counts.c, counts.d)
  return {
    ...counts,
    gradedAnswers,
    avgScore,
    overallGrade: gradedAnswers === 0 ? 'Ungraded' : scoreToGrade(avgScore) || 'Ungraded',
  }
}

/**
 * @param {Array<{
 *   lotNumber: number,
 *   sheetName?: string,
 *   headerLabel?: string,
 *   rowNumber?: number,
 *   siteReference?: string,
 *   siteName?: string,
 *   featureCode?: string,
 *   featureDescription?: string,
 *   squareMetres?: string,
 *   linear?: string,
 *   ward?: string,
 *   category?: string,
 * }>} rows
 */
export function buildGroundsMaintenanceCatalogue(rows) {
  const reviewFlags = GROUNDS_LOTS.filter((lot) => lot.areaNamePending).map((lot) => ({
    type: 'area_name_pending',
    lotId: lot.id,
    lotLabel: lot.label,
    message: lot.areaNameNote,
  }))
  const conflicts = []
  const skippedNotes = []
  const grouped = new Map()

  for (const row of rows || []) {
    const lot = groundsLotByNumber(row?.lotNumber)
    const siteReference = clean(row?.siteReference)
    const siteName = clean(row?.siteName)
    if (!lot) {
      if (siteReference || siteName) {
        conflicts.push({
          type: 'unknown_lot',
          rowNumber: row?.rowNumber ?? null,
          siteReference: siteReference || null,
          siteName: siteName || null,
          message: 'Row is not on a numbered lot tab.',
        })
      }
      continue
    }
    if (!/^SI\//i.test(siteReference)) {
      if (siteName || siteReference) {
        const note = isWorkbookNote(siteReference, siteName)
        const entry = {
          type: note ? 'workbook_note' : 'missing_site_reference',
          lotId: lot.id,
          lotLabel: lot.label,
          rowNumber: row?.rowNumber ?? null,
          siteReference: siteReference || null,
          siteName: siteName || null,
          message: note
            ? 'Workbook note was not imported as a site.'
            : 'Row has no spreadsheet site reference, so it was not imported as a site and is flagged for review.',
        }
        if (note) skippedNotes.push(entry)
        else conflicts.push(entry)
      }
      continue
    }

    const id = groundsSiteId(lot.number, siteReference)
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        lotId: lot.id,
        lotNumber: lot.number,
        lotLabel: lot.label,
        contractor: lot.contractor,
        siteReference,
        names: new Map(),
        wards: new Map(),
        categories: new Map(),
        features: new Map(),
        sheetName: clean(row?.sheetName),
        headerLabel: clean(row?.headerLabel),
      })
    }
    const site = grouped.get(id)
    if (siteName) site.names.set(siteName, (site.names.get(siteName) || 0) + 1)
    const ward = clean(row?.ward)
    const category = clean(row?.category)
    if (ward) site.wards.set(norm(ward), ward)
    if (category) site.categories.set(norm(category), category)
    const feature = {
      code: clean(row?.featureCode),
      description: clean(row?.featureDescription),
      squareMetres: clean(row?.squareMetres),
      linear: clean(row?.linear),
    }
    if (feature.code || feature.description) {
      const key = featureKey(feature)
      if (!site.features.has(key)) site.features.set(key, feature)
    }
  }

  const sites = []
  for (const site of grouped.values()) {
    const names = [...site.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const siteName = names[0]?.[0] || site.siteReference
    if (names.length > 1) {
      conflicts.push({
        type: 'conflicting_site_name',
        lotId: site.lotId,
        lotLabel: site.lotLabel,
        siteReference: site.siteReference,
        siteNames: names.map(([name]) => name),
        message: `Site reference ${site.siteReference} uses more than one name. The import keeps the most common name for review.`,
      })
    }
    sites.push({
      id: site.id,
      lotId: site.lotId,
      lotNumber: site.lotNumber,
      lotLabel: site.lotLabel,
      contractor: site.contractor,
      siteReference: site.siteReference,
      siteName,
      ward: [...site.wards.values()][0] || '',
      category: [...site.categories.values()][0] || '',
      features: [...site.features.values()],
      reviewFlags: names.length > 1 ? ['conflicting_site_name'] : [],
    })
  }

  const byLotAndName = new Map()
  for (const site of sites) {
    const key = `${site.lotId}|${norm(site.siteName)}`
    if (!byLotAndName.has(key)) byLotAndName.set(key, [])
    byLotAndName.get(key).push(site)
  }
  for (const group of byLotAndName.values()) {
    const references = [...new Set(group.map((site) => site.siteReference))]
    if (references.length < 2) continue
    conflicts.push({
      type: 'conflicting_site_reference',
      lotId: group[0].lotId,
      lotLabel: group[0].lotLabel,
      siteName: group[0].siteName,
      siteReferences: references,
      message: `${group[0].siteName} has more than one site reference in ${group[0].lotLabel}. Each reference stays a separate site.`,
    })
    for (const site of group) {
      if (!site.reviewFlags.includes('conflicting_site_reference')) {
        site.reviewFlags.push('conflicting_site_reference')
      }
    }
  }

  const byReference = new Map()
  for (const site of sites) {
    const key = norm(site.siteReference)
    if (!byReference.has(key)) byReference.set(key, [])
    byReference.get(key).push(site)
  }
  for (const group of byReference.values()) {
    const lotIds = [...new Set(group.map((site) => site.lotId))]
    if (lotIds.length < 2) continue
    conflicts.push({
      type: 'site_reference_in_multiple_lots',
      siteReference: group[0].siteReference,
      lots: group.map((site) => site.lotLabel),
      message: `${group[0].siteReference} appears in more than one lot. Each lot keeps its own site.`,
    })
  }

  sites.sort((a, b) => a.lotNumber - b.lotNumber || a.siteName.localeCompare(b.siteName, 'en', { numeric: true }))

  return {
    source: 'Grounds Maintenance Site Lists (3).xlsx',
    writtenToProduction: false,
    lots: GROUNDS_LOTS,
    reviewFlags,
    conflicts,
    skippedNotes,
    sites,
    counts: {
      sites: sites.length,
      features: sites.reduce((sum, site) => sum + site.features.length, 0),
      conflicts: conflicts.length,
      skippedNotes: skippedNotes.length,
      skippedNotes: skippedNotes.length,
      byLot: GROUNDS_LOTS.map((lot) => ({
        lotId: lot.id,
        label: lot.label,
        contractor: lot.contractor,
        sites: sites.filter((site) => site.lotId === lot.id).length,
      })),
    },
  }
}

let cachedCatalogue = null

export function loadGroundsMaintenanceCatalogue() {
  if (cachedCatalogue) return cachedCatalogue
  const file = join(process.cwd(), 'data', 'grounds-maintenance-sites.json')
  cachedCatalogue = JSON.parse(readFileSync(file, 'utf8'))
  return cachedCatalogue
}

export function findGroundsMaintenanceSite(siteId) {
  const id = clean(siteId)
  if (!id) return null
  const catalogue = loadGroundsMaintenanceCatalogue()
  return (catalogue.sites || []).find((site) => site.id === id) || null
}

export function groundsSiteLocationOptions(catalogue = loadGroundsMaintenanceCatalogue()) {
  return (catalogue.sites || []).map((site) => ({
    id: site.id,
    name: `${site.lotLabel} · ${site.siteName} (${site.siteReference})`,
    lotId: site.lotId,
    lotLabel: site.lotLabel,
    contractor: site.contractor,
    siteName: site.siteName,
    siteReference: site.siteReference,
    groundsSite: true,
  }))
}

function coverageForSite(siteId, links) {
  const rows = (links || []).filter((link) => link.siteId === siteId)
  const blocks = []
  const estates = []
  const seenBlocks = new Set()
  const seenEstates = new Set()
  for (const link of rows) {
    if (link.blockId && !seenBlocks.has(link.blockId)) {
      seenBlocks.add(link.blockId)
      blocks.push({ id: link.blockId, name: link.blockName || link.blockId })
    }
    if (link.estateId && !seenEstates.has(link.estateId)) {
      seenEstates.add(link.estateId)
      estates.push({ id: link.estateId, name: link.estateName || link.estateId })
    }
  }
  const parts = [
    ...estates.map((estate) => estate.name),
    ...blocks.map((block) => block.name),
  ]
  return {
    confirmed: parts.length > 0,
    blocks,
    estates,
    label: parts.length > 0 ? parts.join(', ') : 'Coverage not confirmed',
  }
}

function unassignedGroupKey(inspection) {
  const blockId = clean(inspection.blockId)
  if (blockId) return `block:${blockId}`
  const label = norm(inspection.locationLabel)
  if (label) return `label:${label}`
  return `inspection:${inspection.id}`
}

function siteRowFromInspections(site, inspections, links) {
  const grade = gradeFromCounts(countGrades(inspections))
  const coverage = coverageForSite(site.id, links)
  return {
    siteId: site.id,
    siteName: site.siteName,
    siteReference: site.siteReference,
    lotId: site.lotId,
    lotLabel: site.lotLabel,
    contractor: site.contractor,
    inspectionCount: inspections.length,
    ...grade,
    coverage,
    features: (site.features || []).map((feature) => feature.description || feature.code).filter(Boolean),
    needsMapping: false,
    recordedLocation: null,
    reviewFlags: site.reviewFlags || [],
  }
}

function unassignedRow(key, inspections) {
  const sample = inspections[0] || {}
  const recordedLocation = clean(sample.blockName) || clean(sample.locationLabel) || 'Recorded location not set'
  const grade = gradeFromCounts(countGrades(inspections))
  return {
    siteId: `unassigned:${key}`,
    siteName: recordedLocation,
    siteReference: null,
    lotId: UNASSIGNED_LOT_ID,
    lotLabel: UNASSIGNED_LOT_LABEL,
    contractor: null,
    inspectionCount: inspections.length,
    ...grade,
    coverage: {
      confirmed: false,
      blocks: sample.blockId ? [{ id: sample.blockId, name: sample.blockName || recordedLocation }] : [],
      estates: sample.estateName ? [{ id: sample.estateId || '', name: sample.estateName }] : [],
      label: 'Flagged for mapping',
    },
    features: [],
    needsMapping: true,
    recordedLocation,
    reviewFlags: ['needs_mapping'],
  }
}

function lotSummary(lot, siteRows) {
  const summary = summariseBlockOverallGrades(siteRows.map((row) => ({ avgGrade: row.overallGrade })))
  return {
    id: lot.id,
    label: lot.label,
    contractor: lot.contractor || null,
    areaNamePending: Boolean(lot.areaNamePending),
    areaNameNote: lot.areaNameNote || null,
    completedInspections: siteRows.reduce((sum, row) => sum + row.inspectionCount, 0),
    distinctSites: siteRows.length,
    grades: summary.grades,
    sites: siteRows,
  }
}

/**
 * One overall grade per inspected site. A repeat visit adds an inspection
 * and pools its A–D answers, without adding a second site.
 * Linked blocks are context only and are not graded separately.
 */
export function buildGroundsLotReport({ inspections = [], catalogue, links = [], lotId = 'all' } = {}) {
  const sites = catalogue?.sites || []
  const sitesById = new Map(sites.map((site) => [site.id, site]))
  const bySite = new Map()
  const unassigned = new Map()

  for (const inspection of inspections || []) {
    const site = inspection?.gmSiteId ? sitesById.get(inspection.gmSiteId) : null
    if (site) {
      if (!bySite.has(site.id)) bySite.set(site.id, [])
      bySite.get(site.id).push(inspection)
    } else {
      const key = unassignedGroupKey(inspection || {})
      if (!unassigned.has(key)) unassigned.set(key, [])
      unassigned.get(key).push(inspection)
    }
  }

  const lots = GROUNDS_LOTS.map((lot) => {
    const siteRows = sites
      .filter((site) => site.lotId === lot.id && bySite.has(site.id))
      .map((site) => siteRowFromInspections(site, bySite.get(site.id), links))
      .sort((a, b) => a.siteName.localeCompare(b.siteName, 'en', { numeric: true }))
    return lotSummary(lot, siteRows)
  })

  const unassignedLot = lotSummary(
    { id: UNASSIGNED_LOT_ID, label: UNASSIGNED_LOT_LABEL, contractor: null },
    [...unassigned.entries()].map(([key, rows]) => unassignedRow(key, rows))
  )

  let visible = [...lots, unassignedLot]
  const selected = clean(lotId) || 'all'
  if (selected !== 'all') visible = visible.filter((lot) => lot.id === selected)

  const gradeSummary = summariseBlockOverallGrades(
    visible.flatMap((lot) => lot.sites).map((row) => ({ avgGrade: row.overallGrade }))
  )

  return {
    writtenToProduction: false,
    lotId: selected,
    completedInspections: visible.reduce((sum, lot) => sum + lot.completedInspections, 0),
    distinctSites: visible.reduce((sum, lot) => sum + lot.distinctSites, 0),
    grades: gradeSummary.grades,
    lots: visible,
    inspectedSites: visible.flatMap((lot) =>
      lot.sites.map((site) => ({
        lotId: lot.id,
        lotLabel: lot.label,
        siteId: site.siteId,
        siteName: site.siteName,
        siteReference: site.siteReference,
        needsMapping: site.needsMapping,
        recordedLocation: site.recordedLocation,
      }))
    ),
  }
}
