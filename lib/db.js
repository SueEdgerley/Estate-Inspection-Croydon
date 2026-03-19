// Database connection and schema setup for Neon Postgres
// Works with both Vercel Postgres and Neon Postgres
import { Client } from 'pg'

const CONNECTION_ENV_KEYS = ['POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DATABASE_URL', 'DIRECT_URL']
let activeConnectionString = null
let activeConnectionKey = null
let lastDatabaseInitError = null

function readConnectionCandidates() {
  const out = []
  const seen = new Set()
  for (const key of CONNECTION_ENV_KEYS) {
    const value = process.env[key]?.trim()
    if (!value || seen.has(value)) continue
    out.push({ key, value })
    seen.add(value)
  }
  return out
}

function applyConnectionCandidate(candidate) {
  if (!candidate?.value) return
  activeConnectionString = candidate.value
  activeConnectionKey = candidate.key || 'unknown'
  // @vercel/postgres reads POSTGRES_URL; always point it at the active candidate.
  process.env.POSTGRES_URL = candidate.value
}

// Prime the active connection from whichever env var appears first.
const initialCandidates = readConnectionCandidates()
if (initialCandidates[0]) {
  applyConnectionCandidate(initialCandidates[0])
}

function getResolvedConnectionCandidate() {
  if (activeConnectionString) {
    return { key: activeConnectionKey || 'POSTGRES_URL', value: activeConnectionString }
  }
  const first = readConnectionCandidates()[0]
  return first || null
}

function getResolvedConnectionString() {
  return getResolvedConnectionCandidate()?.value || null
}

/** Same resolution as connectionString; use in routes for "is DB configured?" check. */
export function getPgUrl() {
  return getResolvedConnectionString()
}

export function getConnectionString() {
  return getResolvedConnectionString()
}

export function hasDatabase() {
  return Boolean(getResolvedConnectionString())
}

export function getActiveDatabaseSource() {
  return getResolvedConnectionCandidate()?.key || null
}

export function getDatabaseEnvSummary() {
  return CONNECTION_ENV_KEYS.map((key) => ({
    key,
    isSet: Boolean(process.env[key]?.trim()),
  }))
}

export function isDatabaseCredentialError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === '28P01' ||
    message.includes('password authentication failed') ||
    message.includes('authentication failed') ||
    message.includes('role') && message.includes('does not exist')
  )
}

export function getLastDatabaseInitError() {
  return lastDatabaseInitError
}

/** Call at app startup if DB is required; throws if no connection string is set */
export function requireConnectionString() {
  const connectionString = getResolvedConnectionString()
  if (!connectionString) {
    throw new Error(
      'Missing database connection string. Set one of: POSTGRES_PRISMA_URL, POSTGRES_URL, DATABASE_URL, DIRECT_URL'
    )
  }
  return connectionString
}

// Schema is managed by Prisma migrations. See prisma/schema.prisma and run: npx prisma migrate deploy
// This only verifies that the schema exists (e.g. inspections table).
function isSchemaMissingError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42P01' || message.includes('does not exist')
}

async function checkSchemaExistsWithPg(connectionString) {
  if (!connectionString) return false
  const client = new Client({ connectionString })
  try {
    await client.connect()
    await client.query('SELECT 1 FROM inspections LIMIT 1')
    return true
  } catch (err) {
    if (isSchemaMissingError(err)) {
      console.warn(
        '[db] Schema not found. Run: npx prisma migrate deploy (and set DATABASE_URL or POSTGRES_URL in .env)'
      )
      return false
    }
    throw err
  } finally {
    try {
      await client.end()
    } catch {
      // Ignore close errors.
    }
  }
}

async function activateFirstWorkingConnection() {
  const candidates = readConnectionCandidates()
  if (candidates.length === 0) {
    return false
  }

  let lastError = null
  for (const candidate of candidates) {
    applyConnectionCandidate(candidate)
    try {
      const schemaReady = await checkSchemaExistsWithPg(candidate.value)
      if (!schemaReady) {
        // Connection works but schema is not yet migrated. Keep this connection active.
        lastDatabaseInitError = null
        return true
      }
      lastDatabaseInitError = null
      return true
    } catch (error) {
      lastError = error
      if (isDatabaseCredentialError(error)) {
        continue
      }
      throw error
    }
  }

  if (lastError) throw lastError
  return false
}

export async function initDatabase() {
  try {
    const hasCandidate = readConnectionCandidates().length > 0
    if (!hasCandidate) {
      console.warn('Missing database connection string. Set one of: POSTGRES_URL, POSTGRES_PRISMA_URL, DATABASE_URL, DIRECT_URL')
      lastDatabaseInitError = new Error(
        'Missing database connection string. Set one of: POSTGRES_URL, POSTGRES_PRISMA_URL, DATABASE_URL, DIRECT_URL'
      )
      return
    }
    const connected = await activateFirstWorkingConnection()
    if (!connected) {
      return
    }
    lastDatabaseInitError = null
  } catch (error) {
    lastDatabaseInitError = error
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
