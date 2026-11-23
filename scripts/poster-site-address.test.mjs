/**
 * Narrow tests for Walkabout Action Plan poster site address.
 * Run: node --test scripts/poster-site-address.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isWalkaboutPosterInspection,
  resolvePosterSiteAddress,
} from '../lib/poster-site-address.js'

describe('isWalkaboutPosterInspection', () => {
  it('detects Walkabout by template id / type / name', () => {
    assert.equal(isWalkaboutPosterInspection({ template_id: 'tpl_estate_walkabout_v1' }), true)
    assert.equal(isWalkaboutPosterInspection({ type: 'estate_walkabout' }), true)
    assert.equal(isWalkaboutPosterInspection({ template_name: 'Estate Walkabout' }), true)
  })

  it('rejects non-Walkabout inspection types', () => {
    assert.equal(isWalkaboutPosterInspection({ template_name: 'Caretaker Inspection', type: 'inspection' }), false)
    assert.equal(isWalkaboutPosterInspection({ template_name: 'ESM Inspection Form', type: 'inspection' }), false)
    assert.equal(isWalkaboutPosterInspection({ template_name: 'Grounds Maintenance', type: 'inspection' }), false)
    assert.equal(isWalkaboutPosterInspection({ template_name: 'Neighbourhood Voice', type: 'inspection' }), false)
    assert.equal(isWalkaboutPosterInspection({}), false)
  })
})

describe('resolvePosterSiteAddress', () => {
  it('prefers estate_block_name for Walkabout (same source as full report)', () => {
    assert.equal(
      resolvePosterSiteAddress({
        type: 'estate_walkabout',
        estate_block_name: 'Longheath Estate / Canterbury Road 18-20B',
        location_label: 'note',
        title: 'Estate Walkabout',
      }),
      'Longheath Estate / Canterbury Road 18-20B'
    )
  })

  it('does not use officer title as the address', () => {
    assert.equal(
      resolvePosterSiteAddress({
        type: 'estate_walkabout',
        title: 'Estate Walkabout – special visit',
        location_label: null,
      }),
      ''
    )
  })

  it('returns empty for non-Walkabout even when estate_block_name is present', () => {
    assert.equal(
      resolvePosterSiteAddress({
        template_name: 'Caretaker Inspection',
        type: 'inspection',
        estate_block_name: 'Some Estate / Some Block',
        location_label: 'Some Estate / Some Block',
      }),
      ''
    )
  })

  it('omits missing / nullish values safely', () => {
    assert.equal(resolvePosterSiteAddress({ type: 'estate_walkabout', title: 'Estate Walkabout' }), '')
    assert.equal(resolvePosterSiteAddress({ type: 'estate_walkabout', location_label: 'null' }), '')
    assert.equal(resolvePosterSiteAddress({ type: 'estate_walkabout', location_label: 'undefined' }), '')
    assert.equal(resolvePosterSiteAddress({}), '')
  })

  it('falls back to location_label when joined name is absent on Walkabout', () => {
    assert.equal(
      resolvePosterSiteAddress({
        type: 'estate_walkabout',
        location_label: '12 Example Street',
        title: 'Estate Walkabout',
      }),
      '12 Example Street'
    )
  })
})
