/**
 * Narrow tests for Walkabout Action Plan poster site address.
 * Run: node --test scripts/poster-site-address.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePosterSiteAddress } from '../lib/poster-site-address.js'

describe('resolvePosterSiteAddress', () => {
  it('prefers estate_block_name (same source as full report)', () => {
    assert.equal(
      resolvePosterSiteAddress({
        estate_block_name: 'Longheath Estate / Canterbury Road 18-20B',
        location_label: 'note',
        title: 'Estate Walkabout',
      }),
      'Longheath Estate / Canterbury Road 18-20B'
    )
  })

  it('omits missing / nullish values safely', () => {
    assert.equal(resolvePosterSiteAddress({ title: 'Estate Walkabout' }), '')
    assert.equal(resolvePosterSiteAddress({ location_label: 'null' }), '')
    assert.equal(resolvePosterSiteAddress({ location_label: 'undefined' }), '')
    assert.equal(resolvePosterSiteAddress({}), '')
  })

  it('falls back to location_label when joined name is absent', () => {
    assert.equal(
      resolvePosterSiteAddress({ location_label: '12 Example Street', title: 'Estate Walkabout' }),
      '12 Example Street'
    )
  })
})
