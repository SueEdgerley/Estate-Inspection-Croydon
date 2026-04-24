#!/usr/bin/env node
/**
 * Import ./blocks.csv (from current working directory) into public.blocks.
 *
 * - IDs: blk_000001, blk_000016, … (6 digits). Next id = 1 + max existing blk_NNNNNN in the table
 *   (e.g. 15 existing rows → next is blk_000016).
 * - Trims name/postcode, skips blank names, dedupes CSV by name+postcode, skips rows already in DB.
 * - Loads DATABASE_URL from project root .env (then process.env).
 *
 * Usage (from repo root, with blocks.csv next to package.json):
 *   node scripts/import-blocks.js           # dry-run
 *   node scripts/import-blocks.js --apply   # insert
 *
 * Optional: custom path to CSV
 *   node scripts/import-blocks.js --apply /path/to/blocks.csv
 */

const { createReadStream, existsSync, readFileSync } = require('node:fs')
const { resolve, join, basename } = require('node:path')
const { parse } = require('csv-parse')
const pg = require('pg')

const { Pool } = pg

const ID_PREFIX = 'blk_'
const ID_DIGITS = 6
const NAME_MAX = 500
const POSTCODE_MAX = 20

function loadEnvFromFile(envPath) {
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

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
    const key = String(k)
      .trim()
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .replace(/\s+/g, '_')
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
    const { name, postcode } = pickColumns(row)
    const n = trimName(name)
    if (!n) continue
    const p = trimPostcode(postcode)
    records.push({
      name: n.length > NAME_MAX ? n.slice(0, NAME_MAX) : n,
      postcode: p,
    })
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

async function getMaxBlkSeq(client) {
  const { rows } = await client.query(
    'SELECT id FROM blocks WHERE id LIKE $1 AND LENGTH(id) = $2',
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

async function loadExistingKeys(client) {
  const { rows } = await client.query('SELECT name, postcode FROM blocks')
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
  const out = { csvPath: null, apply: false }
  for (const a of argv) {
    if (a === '--apply') out.apply = true
    else if (!a.startsWith('-') && !out.csvPath) out.csvPath = a
  }
  return out
}

async function main() {
  const projectRoot = join(__dirname, '..')
  loadEnvFromFile(join(projectRoot, '.env'))

  const argv = process.argv.slice(2)
  const { csvPath, apply } = parseArgs(argv)
  const csvFile = resolve(csvPath || join(process.cwd(), 'blocks.csv'))

  if (!existsSync(csvFile)) {
    console.error('CSV not found:', csvFile)
    console.error('Place blocks.csv in the current directory, or pass an explicit path.')
    process.exit(1)
  }

  const cs = getConnectionString()
  if (apply && !cs) {
    console.error('Missing DATABASE_URL. Set it in .env (project root) or the environment.')
    process.exit(1)
  }

  const raw = await readAllRows(csvFile)
  const unique = uniqueByNamePostcode(raw)
  const dupInFile = raw.length - unique.length

  console.log('CSV:', basename(csvFile))
  console.log('Rows read (non-blank name):', raw.length)
  console.log('After dedupe (name + postcode):', unique.length)
  if (dupInFile > 0) {
    console.log('Duplicate (name+postcode) in file skipped:', dupInFile)
  }

  if (unique.length === 0) {
    console.error('No rows to import.')
    process.exit(1)
  }

  if (!apply) {
    console.log('\nDRY-RUN (no database writes). Run with --apply to import.\n')
    unique.slice(0, 5).forEach((r) => {
      console.log(' ', r.name, '|', r.postcode == null ? '(no postcode)' : r.postcode)
    })
    process.exit(0)
  }

  const pool = new Pool({ connectionString: cs, max: 3 })
  const client = await pool.connect()
  const insertSql = 'INSERT INTO blocks (id, name, postcode) VALUES ($1, $2, $3)'

  try {
    await client.query('BEGIN')
    const maxSeq = await getMaxBlkSeq(client)
    let nextSeq = maxSeq + 1
    const existingKeys = await loadExistingKeys(client)

    const toInsert = []
    let skippedInDb = 0
    for (const r of unique) {
      const k = dedupeKey(r.name, r.postcode)
      if (existingKeys.has(k)) {
        skippedInDb += 1
        continue
      }
      toInsert.push(r)
      existingKeys.add(k)
    }

    let imported = 0
    for (const r of toInsert) {
      const id = formatBlkId(nextSeq)
      nextSeq += 1
      await client.query(insertSql, [id, r.name, r.postcode])
      imported += 1
    }

    await client.query('COMMIT')

    const lastId = nextSeq - 1
    console.log('---')
    console.log('Imported:', imported)
    console.log('Skipped (already in DB, same name + postcode):', skippedInDb)
    if (imported > 0) {
      console.log(
        'ID range:',
        formatBlkId(maxSeq + 1),
        'to',
        formatBlkId(lastId)
      )
    }
    console.log('(Max blk_* sequence before import was', maxSeq + ')')
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
      'If postcode is missing, run: npx prisma migrate deploy (see prisma/migrations/*blocks_postcode*)'
    )
  }
  process.exit(1)
})
