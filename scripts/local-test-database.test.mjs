import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyLocalTestDatabaseGuard,
  localTestDatabaseRequired,
  readLocalTestDatabaseUrl,
} from '../lib/local-test-database.js'

const KEYS = [
  'REQUIRE_LOCAL_TEST_DATABASE',
  'LOCAL_TEST_DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DATABASE_URL',
  'DIRECT_URL',
  'NEON_DATABASE_URL',
]

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] == null) delete process.env[key]
    else process.env[key] = original[key]
  }
})

function isolatedEnv(values) {
  return { ...values }
}

describe('local test database guard', () => {
  it('does nothing when the local requirement is off', () => {
    const env = isolatedEnv({
      POSTGRES_URL: 'postgres://user:secret@ep-morning-hill-ab87z0fo-pooler.eu-west-2.aws.neon.tech/neondb',
    })
    assert.equal(localTestDatabaseRequired(env), false)
    assert.deepEqual(applyLocalTestDatabaseGuard(env), { applied: false, hostname: null })
    assert.match(env.POSTGRES_URL, /ep-morning-hill/)
  })

  it('stops with a clear message when the test connection is missing', () => {
    const env = isolatedEnv({ REQUIRE_LOCAL_TEST_DATABASE: '1', POSTGRES_URL: 'postgres://live' })
    assert.throws(() => readLocalTestDatabaseUrl(env), /LOCAL_TEST_DATABASE_URL is missing/)
    assert.throws(() => applyLocalTestDatabaseGuard(env), /will not use the live database/)
  })

  it('stops when the test connection is a live host', () => {
    const env = isolatedEnv({
      REQUIRE_LOCAL_TEST_DATABASE: '1',
      LOCAL_TEST_DATABASE_URL:
        'postgres://user:secret@ep-dark-thunder-ab7i92fv.eu-west-2.aws.neon.tech/neondb',
    })
    assert.throws(() => applyLocalTestDatabaseGuard(env), /points at the live database/)
  })

  it('copies a separate test connection over every database env var', () => {
    const testUrl = 'postgres://user:secret@ep-test-branch-pooler.eu-west-2.aws.neon.tech/neondb'
    const env = isolatedEnv({
      REQUIRE_LOCAL_TEST_DATABASE: '1',
      LOCAL_TEST_DATABASE_URL: testUrl,
      POSTGRES_URL: 'postgres://live-pooler',
      DATABASE_URL: 'postgres://live-direct',
    })
    const result = applyLocalTestDatabaseGuard(env)
    assert.equal(result.applied, true)
    assert.equal(result.hostname, 'ep-test-branch-pooler.eu-west-2.aws.neon.tech')
    for (const key of ['POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DATABASE_URL', 'DIRECT_URL', 'NEON_DATABASE_URL']) {
      assert.equal(env[key], testUrl)
    }
  })
})
