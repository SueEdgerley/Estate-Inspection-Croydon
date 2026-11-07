/**
 * Preview the Grounds Maintenance site list from the numbered lot tabs.
 * Writes data/grounds-maintenance-sites.json for local review.
 * Does not insert sites, blocks, or inspections into the database.
 *
 * Usage:
 *   node scripts/preview-grounds-maintenance-import.mjs [path-to-unzipped-xl-folder]
 */

import fs from 'fs'
import path from 'path'
import { buildGroundsMaintenanceCatalogue } from '../lib/grounds-maintenance-sites.js'

const defaultXl = 'C:/Users/2006891/AppData/Local/Temp/gm-site-lists/unzipped/xl'
const xlRoot = path.resolve(process.argv[2] || defaultXl)

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function colIndex(cellRef) {
  const letters = String(cellRef).replace(/[0-9]/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

const sharedXml = fs.readFileSync(path.join(xlRoot, 'sharedStrings.xml'), 'utf8')
const shared = []
for (const item of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  const parts = [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]))
  shared.push(parts.join(''))
}

function readSheet(file) {
  const xml = fs.readFileSync(path.join(xlRoot, 'worksheets', file), 'utf8')
  const rows = []
  for (const row of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const cell of row[2].matchAll(/<c r="([A-Z]+)[0-9]+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?/g)) {
      const idx = colIndex(cell[1])
      const attrs = cell[2] || ''
      const raw = cell[3] == null ? '' : decodeXml(cell[3])
      cells[idx] = /\bt="s"/.test(attrs) ? shared[Number(raw)] || '' : raw
    }
    rows.push({ row: Number(row[1]), cells })
  }
  return rows
}

const sheets = [
  { lotNumber: 1, file: 'sheet1.xml', sheetName: 'Lot 1 North Croydon - Krinkels' },
  { lotNumber: 2, file: 'sheet2.xml', sheetName: 'Lot 2 East Croydon - Krinkels' },
  { lotNumber: 3, file: 'sheet3.xml', sheetName: 'Lot 3 South Croydon - Cleanscap' },
  { lotNumber: 4, file: 'sheet6.xml', sheetName: 'Lot 4 Extra-Care scheme - Green' },
]

const parsedRows = []
for (const sheet of sheets) {
  const rows = readSheet(sheet.file)
  const headerLabel = String(rows[0]?.cells?.[0] || '')
  for (const row of rows.slice(1)) {
    const cells = row.cells || []
    const siteReference = cells[0]
    if (String(siteReference || '').trim() === 'Croydon Sites - Plot Details') continue
    parsedRows.push({
      lotNumber: sheet.lotNumber,
      sheetName: sheet.sheetName,
      headerLabel,
      rowNumber: row.row,
      siteReference,
      siteName: cells[1],
      featureCode: cells[2],
      featureDescription: cells[3],
      squareMetres: cells[4],
      linear: cells[5],
      ward: cells[6],
      category: cells[7],
    })
  }
}

const catalogue = buildGroundsMaintenanceCatalogue(parsedRows)
const dataDir = path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })
const outFile = path.join(dataDir, 'grounds-maintenance-sites.json')
fs.writeFileSync(outFile, JSON.stringify(catalogue))
const preview = {
  writtenToProduction: false,
  counts: catalogue.counts,
  reviewFlags: catalogue.reviewFlags,
  conflicts: catalogue.conflicts,
  skippedNotes: catalogue.skippedNotes,
  lot4Sites: catalogue.sites
    .filter((site) => site.lotId === 'lot-4')
    .map((site) => ({ siteReference: site.siteReference, siteName: site.siteName, features: site.features.length })),
}
const previewFile = path.join(dataDir, 'grounds-maintenance-import-preview.json')
fs.writeFileSync(previewFile, JSON.stringify(preview, null, 2))

console.log('Grounds Maintenance import preview')
console.log('Source folder:', xlRoot)
console.log('Written to production: no')
console.log('Local catalogue:', outFile)
console.log('Preview:', previewFile)
console.log(JSON.stringify({ counts: catalogue.counts, reviewFlags: catalogue.reviewFlags, conflictTypes: catalogue.conflicts.reduce((acc, item) => { acc[item.type] = (acc[item.type] || 0) + 1; return acc }, {}) }, null, 2))
