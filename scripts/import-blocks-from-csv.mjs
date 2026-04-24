#!/usr/bin/env node
/**
 * Import block/location rows from CSV (columns: name, postcode) into public.blocks.
 *
 * - IDs: blk_000001, blk_000002, … (6 digits). Next number = 1 + max existing blk_NNNNNN suffix.
 * - Trims name and postcode; skips rows with blank name; deduplicates by (name, postcode) in the CSV
 * - Skips rows that already match name + postcode in the database
 * - Inserts: INSERT INTO blocks (id, name, postcode) — other columns use table defaults
 * - Uses DATABASE_URL (see getConnectionString)
 * - Default: dry-run. Writes require: --apply
 *
 *   node scripts/import-blocks-from-csv.mjs path/to/blocks.csv
 *   node scripts/import-blocks-from-csv.mjs path/to/blocks.csv --apply
 */

import { createReadStream } from 'node:fs'
import { resolve, basename } from 'node:path'
import { parse } from 'csv-parse'
import pg from 'pg'

const { Pool } = pg

const ID_PREFIX = 'blk_'
const ID_DIGITS = 6
const NAME_MAX = 500
const POSTCODE_MAX = 20
const BATCH_DEFAULT = 200

function getConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DIRECT_URL ||
    process.env.NEON_DATABASE_URL ||
    null
  )
}

function trimName(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\s+/g, ' ')
}

function trimPostcode(s) {
  const t = String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  return t.length ? t.slice(0, POSTCODE_MAX) : null
}

function dedupeKey(name, postcode) {
  return `${name}\t${postcode == null ? '' : postcode}`
}

function formatBlkId(n) {
  return `${ID_PREFIX}${String(n).padStart(ID_DIGITS, '0')}`
}

function pickColumns(row) {
  const map = {}
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).trim().replace(/^\uFEFF/, '').toLowerCase().replace(/\s+/g, '_')
    map[key] = v
  }
  const name =
    map.name ??
    map.block ??
    map.location ??
    map.block_name ??
    map['block/location'] ??
    map.blocklocation
  const postcode = map.postcode ?? map.post_code ?? map.zip ?? map.post
  return { name: name != null ? String(name) : '', postcode: postcode != null ? String(postcode) : '' }
}

async function readAllRows(filePath) {
  const records = []
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const parser = stream.pipe(
    parse({
      columns: (header) => header.map((h) => String(h).trim().replace(/^\uFEFF/, '')),
      skip_empty_lines: true,
      trim: true,
    })
  )
  for await (const row of parser) {
    if (typeof row !== 'object' || row == null) continue
    const { name, postcode } = pickColumns(/** @type {Record<string, string>} */ (row))
    const n = trimName(name)
    if (!n) continue
    const p = trimPostcode(postcode)
    records.push({ name: n.length > NAME_MAX ? n.slice(0, NAME_MAX) : n, postcode: p })
  }
  return records
}

function uniqueByNamePostcode(records) {
  const m = new Map()
  for (const r of records) {
    const k = dedupeKey(r.name, r.postcode)
    if (!m.has(k)) m.set(k, r)
  }
  return Array.from(m.values())
}

/**
 * @param {import('pg').PoolClient} client
 */
async function getMaxBlkSeq(client) {
  const { rows } = await client.query(
    `SELECT id FROM blocks WHERE id LIKE $1 AND LENGTH(id) = $2`,
    [`${ID_PREFIX}%`, ID_PREFIX.length + ID_DIGITS]
  )
  const re = new RegExp(`^${ID_PREFIX}([0-9]{${ID_DIGITS}})$`)
  let max = 0
  for (const { id } of rows) {
    const m = re.exec(String(id))
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return max
}

/**
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Set<string>>}
 */
async function loadExistingKeys(client) {
  const { rows } = await client.query(
    `SELECT name, postcode FROM blocks`
  )
  const set = new Set()
  for (const row of rows) {
    const n = trimName(row.name)
    const p = trimPostcode(row.postcode == null ? '' : String(row.postcode))
    if (!n) continue
    set.add(dedupeKey(n, p))
  }
  return set
}

function parseArgs(argv) {
  const out = { file: null, apply: false, batchSize: BATCH_DEFAULT }
  for (const a of argv) {
    if (a === '--apply') out.apply = true
    else if (a.startsWith('--batch-size=')) {
      const n = parseInt(a.slice('--batch-size='.length), 10)
      if (Number.isFinite(n) && n > 0) out.batchSize = n
    } else if (!a.startsWith('-') && !out.file) {
      out.file = a
    }
  }
  return out
}

async function main() {
  const argv = process.argv.slice(2)
  const { file, apply, batchSize } = parseArgs(argv)
  if (!file) {
    console.error(
      'Usage: node scripts/import-blocks-from-csv.mjs <file.csv> [--apply] [--batch-size=200]\n' +
        '  Without --apply: dry-run (no database writes).'
    )
    process.exit(1)
  }

  const abs = resolve(file)
  const cs = getConnectionString()
  if (apply && !cs) {
    console.error('Missing DATABASE_URL (or POSTGRES_URL / NEON_DATABASE_URL).')
    process.exit(1)
  }

  const raw = await readAllRows(abs)
  const unique = uniqueByNamePostcode(raw)
  const dupInFile = raw.length - unique.length

  console.log('File:', basename(abs))
  console.log('Rows read (non-blank name):', raw.length)
  console.log('After dedupe (name + postcode):', unique.length)
  if (dupInFile > 0) {
    console.log('Duplicate (name+postcode) lines skipped in file:', dupInFile)
  }

  if (unique.length === 0) {
    console.error('No rows to import.')
    process.exit(1)
  }

  if (!apply) {
    console.log('\nDRY-RUN: no database changes. Re-run with --apply to import.\n')
    console.log('First 5 unique rows:')
    unique.slice(0, 5).forEach((r) => {
      console.log(' ', r.name, '|', r.postcode == null ? '(no postcode)' : r.postcode)
    })
    process.exit(0)
  }

  const pool = new Pool({ connectionString: cs, max: 3 })
  const client = await pool.connect()
  const insertSql = `
    INSERT INTO blocks (id, name, postcode)
    VALUES ($1, $2, $3)
  `

  let nextSeq
  let existingKeys
  try {
    await client.query('BEGIN')
    const maxSeq = await getMaxBlkSeq(client)
    nextSeq = maxSeq + 1
    existingKeys = await loadExistingKeys(client)

    const toInsert = []
    let skippedAlreadyInDb = 0
    for (const r of unique) {
      const k = dedupeKey(r.name, r.postcode)
      if (existingKeys.has(k)) {
        skippedAlreadyInDb += 1
        continue
      }
      toInsert.push({ ...r, _key: k })
      existingKeys.add(k)
    }

    let imported = 0
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize)
      for (const r of batch) {
        const id = formatBlkId(nextSeq)
        nextSeq += 1
        await client.query(insertSql, [id, r.name, r.postcode])
        imported += 1
      }
    }

    await client.query('COMMIT')
    console.log('---')
    console.log('Rows imported (new blocks):', imported)
    console.log('Rows skipped (already in DB, same name + postcode):', skippedAlreadyInDb)
    const maxAfter = maxSeq + imported
    if (imported > 0) {
      console.log('ID range this run:', formatBlkId(maxSeq + 1), '…', formatBlkId(maxAfter))
    }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  if (err.message && /postcode|column/i.test(String(err.message))) {
    console.error(
      '\nIf postcode is missing on blocks, run: npx prisma migrate deploy\n' +
        '  (see prisma/migrations/*_blocks_postcode/)'
    )
  }
  process.exit(1)
})
