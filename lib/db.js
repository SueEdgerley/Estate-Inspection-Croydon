// Database connection and schema setup for Neon Postgres
// Works with both Vercel Postgres and Neon Postgres
import { sql } from '@vercel/postgres'
import { neon } from '@neondatabase/serverless'

// Resolve connection string from common env var names (Vercel Postgres / Prisma / Neon)
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.NEON_DATABASE_URL

// So @vercel/postgres can use it when POSTGRES_URL is not set
if (connectionString && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = connectionString
}

/** Same resolution as connectionString; use in routes for "is DB configured?" check. */
export function getPgUrl() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.NEON_DATABASE_URL ||
    null
  )
}

export function getConnectionString() {
  return connectionString || null
}

/** Raw SQL + params (same wire format as @vercel/postgres). Used for merged WHERE fragments from `joinSqlAnd`. */
let neonQuery = null
export function getNeonQuery() {
  if (neonQuery) return neonQuery
  const cs = getConnectionString()
  if (!cs) throw new Error('Missing database connection string')
  neonQuery = neon(cs, { fullResults: true })
  return neonQuery
}

export function hasDatabase() {
  return Boolean(connectionString)
}

/** Call at app startup if DB is required; throws if no connection string is set */
export function requireConnectionString() {
  if (!connectionString) {
    throw new Error(
      'Missing database connection string. Set one of: POSTGRES_PRISMA_URL, POSTGRES_URL, DATABASE_URL, DIRECT_URL, NEON_DATABASE_URL'
    )
  }
  return connectionString
}

// Schema is managed by Prisma migrations. See prisma/schema.prisma and run: npx prisma migrate deploy
// This only verifies that the schema exists (e.g. inspections table).
async function checkSchemaExists() {
  if (!connectionString) return false
  try {
    await sql`SELECT 1 FROM inspections LIMIT 1`
    return true
  } catch (err) {
    if (err?.code === '42P01' || err?.message?.includes('does not exist')) {
      console.warn(
        '[db] Schema not found. Run: npx prisma migrate deploy (and set DATABASE_URL or POSTGRES_URL in .env)'
      )
      return false
    }
    throw err
  }
}

export async function initDatabase() {
  try {
    if (!connectionString) {
      console.warn('Missing database connection string. Set one of: POSTGRES_URL, POSTGRES_PRISMA_URL, DATABASE_URL, DIRECT_URL, NEON_DATABASE_URL')
      return
    }
    const ok = await checkSchemaExists()
    if (!ok) {
      return
    }
    await ensureInspectionTimingFields()
  } catch (error) {
    console.error('Error checking database schema:', error)
  }
}

// Initialize on import (runs once per serverless function)
let initialized = false
export async function ensureDatabase() {
  if (!initialized) {
    await initDatabase()
    initialized = true
  }
}

/**
 * True if `public.<tableName>` exists. Use before querying optional tables that
 * may not be present on every Neon instance (e.g. Phase 1 vs full Prisma migrate).
 * @param {string} tableName unquoted PostgreSQL table name (letters, digits, underscore)
 */
export async function pgPublicTableExists(tableName) {
  if (!tableName || typeof tableName !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    return false
  }
  const name = tableName.toLowerCase()
  try {
    const r = await sql`
      SELECT 1 AS one
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${name}
      LIMIT 1
    `
    return r.rows.length > 0
  } catch {
    return false
  }
}

export async function ensureInspectionTimingFields() {
  if (!connectionString) return
  await sql`
    ALTER TABLE inspections
      ADD COLUMN IF NOT EXISTS inspection_start_time TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inspection_end_time TIMESTAMPTZ
  `
}
