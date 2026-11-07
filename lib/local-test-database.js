/**
 * Local-only guard. Production does not set REQUIRE_LOCAL_TEST_DATABASE.
 * When the flag is set, every database env var is replaced with LOCAL_TEST_DATABASE_URL.
 * A missing URL or a live host stops the process instead of falling back to production.
 */

const CONNECTION_ENV_KEYS = [
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DATABASE_URL',
  'DIRECT_URL',
  'NEON_DATABASE_URL',
]

const LIVE_HOST_MARKERS = ['ep-morning-hill', 'ep-dark-thunder']

export function localTestDatabaseRequired(env = process.env) {
  const raw = String(env.REQUIRE_LOCAL_TEST_DATABASE || '')
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function readLocalTestDatabaseUrl(env = process.env) {
  const value = String(env.LOCAL_TEST_DATABASE_URL || '').trim()
  if (!value) {
    throw new Error(
      'Local test database is required, but LOCAL_TEST_DATABASE_URL is missing. The local app will not use the live database. Add LOCAL_TEST_DATABASE_URL to .env.local, then restart the local app.'
    )
  }
  let hostname = ''
  try {
    hostname = new URL(value).hostname
  } catch {
    throw new Error(
      'LOCAL_TEST_DATABASE_URL is not a valid database URL. The local app will not use the live database.'
    )
  }
  const liveHost = LIVE_HOST_MARKERS.find((marker) => hostname.includes(marker))
  if (liveHost) {
    throw new Error(
      `LOCAL_TEST_DATABASE_URL points at the live database (${hostname}). The local app will not start. Use the separate Neon test branch.`
    )
  }
  return { connectionString: value, hostname }
}

export function applyLocalTestDatabaseGuard(env = process.env) {
  if (!localTestDatabaseRequired(env)) return { applied: false, hostname: null }
  const { connectionString, hostname } = readLocalTestDatabaseUrl(env)
  for (const key of CONNECTION_ENV_KEYS) env[key] = connectionString
  return { applied: true, hostname }
}
