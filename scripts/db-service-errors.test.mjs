import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isDatabaseQuotaError,
  dashboardUnavailablePayload,
} from '../lib/db-service-errors.js'

describe('isDatabaseQuotaError', () => {
  it('detects Neon HTTP 402 quota message', () => {
    const err = new Error('HTTP 402 – Your project has exceeded the data transfer quota.')
    assert.equal(isDatabaseQuotaError(err), true)
  })

  it('detects statusCode 402', () => {
    assert.equal(isDatabaseQuotaError({ statusCode: 402, message: 'quota' }), true)
  })

  it('ignores unrelated errors', () => {
    assert.equal(isDatabaseQuotaError(new Error('relation "foo" does not exist')), false)
  })
})

describe('dashboardUnavailablePayload', () => {
  it('does not expose raw database details', () => {
    const p = dashboardUnavailablePayload()
    assert.equal(p.code, 'DASHBOARD_UNAVAILABLE')
    assert.ok(!JSON.stringify(p).toLowerCase().includes('neon'))
    assert.ok(!JSON.stringify(p).includes('402'))
  })
})
