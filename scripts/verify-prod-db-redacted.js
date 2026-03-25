/**
 * Read DATABASE_URL from .env.production.local (Vercel Production pull),
 * print only redacted connection facts, run read-only catalog checks.
 * Does not print credentials.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

function loadDatabaseUrl() {
  const envFile = path.join(process.cwd(), '.env.production.local')
  if (!fs.existsSync(envFile)) {
    throw new Error('Missing .env.production.local — run: npx vercel env pull .env.production.local --environment=production')
  }
  const raw = fs.readFileSync(envFile, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key === 'DATABASE_URL') return value
  }
  throw new Error('DATABASE_URL not found in .env.production.local')
}

function redactedFacts(connectionString) {
  // postgresql://user:pass@host:port/dbname?query
  const u = connectionString.replace(/^postgres(ql)?:\/\//i, 'postgres://')
  const withoutProto = u.replace(/^postgres:\/\//i, '')
  const at = withoutProto.indexOf('@')
  const rest = at >= 0 ? withoutProto.slice(at + 1) : withoutProto
  const slash = rest.indexOf('/')
  const hostPort = slash >= 0 ? rest.slice(0, slash) : rest
  const afterSlash = slash >= 0 ? rest.slice(slash + 1) : ''
  const q = afterSlash.indexOf('?')
  const dbName = q >= 0 ? afterSlash.slice(0, q) : afterSlash
  const host = hostPort.includes(':') ? hostPort.split(':')[0] : hostPort
  const pooler = /pooler/i.test(host || '')
  const direct = !pooler && Boolean(host)
  return {
    host: host || null,
    databaseName: dbName || null,
    endpointKind: pooler ? 'pooler (likely Neon pooler)' : direct ? 'direct (non-pooler hostname)' : 'unknown',
  }
}

async function main() {
  const connectionString = loadDatabaseUrl()
  const facts = redactedFacts(connectionString)

  const client = new Client({ connectionString })
  await client.connect()
  try {
    const r = await client.query(`
      SELECT
        current_database() AS current_database,
        current_schema() AS current_schema,
        to_regclass('public.estates')::text AS reg_estates,
        to_regclass('public.blocks')::text AS reg_blocks
    `)
    const row = r.rows[0]
    console.log(
      JSON.stringify(
        {
          source: 'DATABASE_URL from .env.production.local (Vercel Production environment pull)',
          redactedConnection: facts,
          neonMatchHint:
            'Compare host and database name to what you see in Neon (same host + same DB name = same branch endpoint for that connection string).',
          queries: {
            current_database: row.current_database,
            current_schema: row.current_schema,
            to_regclass_public_estates: row.reg_estates,
            to_regclass_public_blocks: row.reg_blocks,
          },
          createFormDbPath:
            'Server-side create form loads estates/blocks via @vercel/postgres sql in lib/load-reference-estates-blocks.js, which uses getPgUrl() in lib/db.js — same resolution order as Production: POSTGRES_URL || POSTGRES_PRISMA_URL || DATABASE_URL. On Vercel Production, DATABASE_URL is typically set, so the deployed app uses that same connection string.',
        },
        null,
        2
      )
    )
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }, null, 2))
  process.exit(1)
})
