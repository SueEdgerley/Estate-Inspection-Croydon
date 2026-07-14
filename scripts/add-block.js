#!/usr/bin/env node
/**
 * Add a single block/location using the same rules as Admin → Blocks
 * (app/api/admin/blocks + lib/blocks-repository.js):
 *   - table: public.blocks
 *   - ids: blk_NNNNNN (next after max existing)
 *   - optional estate_id / postcode; active defaults true
 *
 * Usage (from repo root):
 *   node scripts/add-block.js --name "Gorse Road 13-19" --postcode "CR0 8LH"
 *   node scripts/add-block.js --name "Gorse Road 13-19" --postcode "CR0 8LH" --apply
 *
 * Optional: --estate-id <id>  --id <custom_id>
 */
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { Pool } = require('pg')

const ID_PREFIX = 'blk_'
const ID_DIGITS = 6

function loadEnvFromFile(envPath) {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

function formatBlkId(n) {
  return `${ID_PREFIX}${String(n).padStart(ID_DIGITS, '0')}`
}

async function getNextBlkId(client) {
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
  return formatBlkId(max + 1)
}

function parseArgs(argv) {
  const out = { apply: false, name: null, postcode: null, estateId: null, id: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (a === '--name') out.name = argv[++i]
    else if (a === '--postcode') out.postcode = argv[++i]
    else if (a === '--estate-id') out.estateId = argv[++i]
    else if (a === '--id') out.id = argv[++i]
  }
  return out
}

async function main() {
  const projectRoot = join(__dirname, '..')
  loadEnvFromFile(join(projectRoot, '.env'))
  loadEnvFromFile(join(projectRoot, '.env.local'))

  const args = parseArgs(process.argv.slice(2))
  if (!args.name || !String(args.name).trim()) {
    console.error(
      'Usage: node scripts/add-block.js --name "Block name" [--postcode "CR0 8LH"] [--estate-id id] [--apply]'
    )
    process.exit(1)
  }

  const name = String(args.name).trim()
  const postcode = args.postcode != null ? String(args.postcode).trim() || null : null
  const estateId = args.estateId != null ? String(args.estateId).trim() || null : null

  console.log('Proposed block (Admin Blocks / blocks-repository equivalent):')
  console.log('  name:', name)
  console.log('  postcode:', postcode || '(none)')
  console.log('  estate_id:', estateId || '(none — matches other Gorse Road rows)')
  console.log('  active: true')

  if (!args.apply) {
    console.log('\nDRY-RUN only. Re-run with --apply to write.')
    process.exit(0)
  }

  const cs = getConnectionString()
  if (!cs) {
    console.error('No database URL configured (DATABASE_URL / POSTGRES_URL / …).')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false }, max: 2 })
  const client = await pool.connect()

  try {
    const existing = await client.query(
      `SELECT b.id, b.name, b.postcode, b.estate_id, e.name AS estate_name, e.area AS estate_area
       FROM blocks b
       LEFT JOIN estates e ON e.id = b.estate_id
       WHERE LOWER(TRIM(b.name)) = LOWER(TRIM($1))
       LIMIT 5`,
      [name]
    )
    if (existing.rows.length) {
      console.log('\nAlready exists — no insert:')
      console.log(JSON.stringify(existing.rows, null, 2))
      return
    }

    const id = args.id && String(args.id).trim() ? String(args.id).trim() : await getNextBlkId(client)

    await client.query(
      `INSERT INTO blocks (id, estate_id, name, postcode, active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (id) DO UPDATE SET
         estate_id = EXCLUDED.estate_id,
         name = EXCLUDED.name,
         postcode = EXCLUDED.postcode,
         active = EXCLUDED.active,
         updated_at = CURRENT_TIMESTAMP`,
      [id, estateId, name, postcode]
    )

    const verify = await client.query(
      `SELECT b.id, b.name, b.postcode, b.active, b.estate_id, b.created_at,
              e.name AS estate_name, e.area AS estate_area
       FROM blocks b
       LEFT JOIN estates e ON e.id = b.estate_id
       WHERE b.id = $1`,
      [id]
    )

    console.log('\nCreated:')
    console.log(JSON.stringify(verify.rows[0], null, 2))

    const neighbours = await client.query(
      `SELECT id, name, postcode
       FROM blocks
       WHERE name ILIKE '%gorse%'
       ORDER BY LOWER(name), name`
    )
    console.log('\nAll Gorse Road locations (alphabetical):')
    for (const row of neighbours.rows) {
      const mark = row.id === id ? ' ← new' : ''
      console.log(`  ${row.name} (${row.postcode || 'no postcode'})${mark}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
