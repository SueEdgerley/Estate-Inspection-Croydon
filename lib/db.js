// Database connection and schema setup for Neon Postgres
// Works with both Vercel Postgres and Neon Postgres
import { sql } from '@vercel/postgres'

// Resolve connection string from common env var names (Vercel Postgres / Prisma / Neon)
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL

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
    null
  )
}

export function getConnectionString() {
  return connectionString || null
}

export function hasDatabase() {
  return Boolean(connectionString)
}

/** Call at app startup if DB is required; throws if no connection string is set */
export function requireConnectionString() {
  if (!connectionString) {
    throw new Error(
      'Missing database connection string. Set one of: POSTGRES_PRISMA_URL, POSTGRES_URL, DATABASE_URL, DIRECT_URL'
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
      console.warn('Missing database connection string. Set one of: POSTGRES_URL, POSTGRES_PRISMA_URL, DATABASE_URL, DIRECT_URL')
      return
    }
    const ok = await checkSchemaExists()
    if (!ok) {
      return
    }
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
