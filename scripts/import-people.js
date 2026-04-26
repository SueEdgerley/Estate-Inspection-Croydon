#!/usr/bin/env node
/**
 * Import people.csv into public.people (Neon Postgres via DATABASE_URL from .env or env).
 *
 * - CSV columns: name, email, role, job_title, category, active
 * - Inserts: id, name, email, role, job_title, category, active; airtable_id is always NULL
 * - IDs: ppl_000001 … (6 digits). Next id = 1 + max existing ppl_NNNNNN
 * - Skips blank names. Dedupes CSV: by trimmed lower email when present, else name + category
 * - Skips DB rows that already match on email (any) or, when CSV had no email, name + category
 * - Empty email: stable synthetic address import+<sha256>@no-email.import (NOT NULL + UNIQUE on people.email)
 *
 *   node scripts/import-people.js
 *   node scripts/import-people.js --apply
 *   node scripts/import-people.js --apply /path/to/people.csv
 *
 * Default file search (in order): ./people.csv, <project>/people.csv, <project>/People.csv, ./People.csv
 */

const { createReadStream, existsSync, readFileSync } = require('node:fs')
const { resolve, join, basename } = require('node:path')
const { createHash } = require('node:crypto')
const { parse } = require('csv-parse')
const pg = require('pg')

const { Pool } = pg

const ID_PREFIX = 'ppl_'
const ID_DIGITS = 6
const NAME_MAX = 255
const EMAIL_MAX = 255
const ROLE_MAX = 100
const CATEGORY_MAX = 50

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

function trimEmail(s) {
  return String(s ?? '').trim()
}

function trimRole(s) {
  const t = String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  return t.length ? t.slice(0, ROLE_MAX) : null
}

function trimCategory(s) {
  const t = String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  return t.length ? t.slice(0, CATEGORY_MAX) : null
}

function syntheticEmail(name, category) {
  const h = createHash('sha256')
    .update(`${name}|${category == null ? '' : category}`, 'utf8')
    .digest('hex')
    .slice(0, 24)
  const addr = `import+${h}@no-email.import`
  return addr.length > EMAIL_MAX ? addr.slice(0, EMAIL_MAX) : addr
}

function resolveEmail(name, category, emailRaw) {
  const t = trimEmail(emailRaw)
  if (t) return t.slice(0, EMAIL_MAX)
  return syntheticEmail(name, category)
}

function nameCategoryKey(name, category) {
  return `${name}\t${category == null ? '' : category}`
}

function parseActive(raw) {
  if (raw == null || String(raw).trim() === '') return true
  const s = String(raw).trim().toLowerCase()
  if (['false', '0', 'no', 'n', 'inactive'].includes(s)) return false
  return true
}

function formatPplId(n) {
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
  return {
    name: map.name != null ? String(map.name) : '',
    email: map.email != null ? String(map.email) : '',
    role: map.role != null ? String(map.role) : '',
    job_title: map.job_title != null ? String(map.job_title) : '',
    category: map.category != null ? String(map.category) : '',
    active: map.active,
  }
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
    const raw = pickColumns(row)
    const name = trimName(raw.name)
    if (!name) continue
    records.push({
      name: name.length > NAME_MAX ? name.slice(0, NAME_MAX) : name,
      email: raw.email,
      role: raw.role,
      job_title: raw.job_title,
      category: raw.category,
      active: raw.active,
    })
  }
  return records
}

/**
 * Dedupe CSV: if row has non-empty email → key by lower(email); else key by name + category.
 */
function uniqueInCsv(records) {
  const m = new Map()
  for (const r of records) {
    const cat = trimCategory(r.category)
    const emailTrim = trimEmail(r.email)
    const key = emailTrim
      ? `e:${emailTrim.toLowerCase()}`
      : `nc:${nameCategoryKey(r.name, cat)}`
    if (!m.has(key)) {
      const hadRealEmail = !!emailTrim
      const email = resolveEmail(r.name, cat, emailTrim)
      m.set(key, {
        name: r.name,
        email,
        hadRealEmail,
        role: trimRole(r.role),
        job_title: trimRole(r.job_title),
        category: cat,
        active: parseActive(r.active),
      })
    }
  }
  return Array.from(m.values())
}

async function getMaxPplSeq(client) {
  const { rows } = await client.query(
    'SELECT id FROM people WHERE id LIKE $1 AND LENGTH(id) = $2',
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

async function loadExistingLookup(client) {
  const { rows } = await client.query(
    'SELECT lower(trim(email)) AS el, name, category FROM people'
  )
  const emailsLower = new Set()
  const nameCats = new Set()
  for (const row of rows) {
    if (row.el) emailsLower.add(String(row.el))
    const n = trimName(row.name)
    if (!n) continue
    const c = trimCategory(row.category)
    nameCats.add(nameCategoryKey(n, c))
  }
  return { emailsLower, nameCats }
}

function shouldSkipInDb(row, emailsLower, nameCats) {
  const emailLower = row.email.toLowerCase()
  if (emailsLower.has(emailLower)) return true
  if (!row.hadRealEmail && nameCats.has(nameCategoryKey(row.name, row.category))) return true
  return false
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
  let csvFile = resolve(csvPath || join(process.cwd(), 'people.csv'))
  if (!existsSync(csvFile) && !csvPath) {
    const candidates = [
      join(projectRoot, 'people.csv'),
      join(projectRoot, 'People.csv'),
      join(process.cwd(), 'People.csv'),
    ]
    for (const p of candidates) {
      if (existsSync(p)) {
        csvFile = p
        break
      }
    }
  }

  if (!existsSync(csvFile)) {
    console.error('CSV not found:', csvFile)
    console.error(
      'Place people.csv (or People.csv) in the project root or current directory, or pass an explicit path.'
    )
    process.exit(1)
  }

  const cs = getConnectionString()
  if (apply && !cs) {
    console.error('Missing DATABASE_URL. Set it in .env (project root) or the environment.')
    process.exit(1)
  }

  const raw = await readAllRows(csvFile)
  const unique = uniqueInCsv(raw)
  const dupInFile = raw.length - unique.length

  console.log('CSV:', basename(csvFile))
  console.log('Rows read (non-blank name):', raw.length)
  console.log('After dedupe (email, or name+category if no email):', unique.length)
  if (dupInFile > 0) {
    console.log('Duplicate keys in file skipped:', dupInFile)
  }

  if (unique.length === 0) {
    console.error('No rows to import.')
    process.exit(1)
  }

  if (!apply) {
    console.log('\nDRY-RUN (no database writes). Run with --apply to import.\n')
    unique.slice(0, 5).forEach((r) => {
      const em = r.hadRealEmail ? r.email : `${r.email} (synthetic)`
      console.log(' ', r.name, '|', em, '|', r.role || '—', '|', r.job_title || '—', '|', r.category || '—', '| active:', r.active)
    })
    process.exit(0)
  }

  const pool = new Pool({ connectionString: cs, max: 3 })
  const client = await pool.connect()
  const insertSql =
    'INSERT INTO people (id, name, email, role, job_title, category, active, airtable_id) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)'

  try {
    await client.query('BEGIN')
    const maxSeq = await getMaxPplSeq(client)
    let nextSeq = maxSeq + 1
    const { emailsLower, nameCats } = await loadExistingLookup(client)

    const toInsert = []
    let skippedInDb = 0
    for (const r of unique) {
      if (shouldSkipInDb(r, emailsLower, nameCats)) {
        skippedInDb += 1
        continue
      }
      toInsert.push(r)
      emailsLower.add(r.email.toLowerCase())
      nameCats.add(nameCategoryKey(r.name, r.category))
    }

    let imported = 0
    for (const r of toInsert) {
      const id = formatPplId(nextSeq)
      nextSeq += 1
      await client.query(insertSql, [id, r.name, r.email, r.role, r.job_title, r.category, r.active])
      imported += 1
    }

    await client.query('COMMIT')

    const lastId = nextSeq - 1
    console.log('---')
    console.log('Imported:', imported)
    console.log('Skipped (already in DB):', skippedInDb)
    if (imported > 0) {
      console.log('ID range:', formatPplId(maxSeq + 1), 'to', formatPplId(lastId))
    }
    console.log('(Max ppl_* sequence before import was', maxSeq + ')')
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
  process.exit(1)
})
