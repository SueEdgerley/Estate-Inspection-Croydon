/**
 * Lightweight checks for person-display + photo-grid helpers.
 * Run: node scripts/verify-action-photo-and-person-display.mjs
 */

import assert from 'node:assert/strict'
import {
  formatPersonDisplayName,
  looksLikePersonId,
  questionStoresPersonId,
} from '../lib/resolve-person-display-name.js'
import { photoGridMetrics } from '../lib/pdf/photo-grid-metrics.js'

const three = photoGridMetrics(3, 200, {
  photoBoxW: 160,
  photoBoxH: 58,
  pad: 4,
  gap: 4,
  multiMinW: 72,
})
assert.ok(three.cols >= 1)
assert.ok(three.rows >= 1)
assert.equal(three.cols * three.rows >= 3, true)

assert.equal(looksLikePersonId('f9173865-ce3c-4d52-89a3-582b42805a09'), true)
assert.equal(looksLikePersonId('person_abc123'), true)
assert.equal(looksLikePersonId('Jane Smith'), false)
assert.equal(looksLikePersonId('Housing Officer'), false)
assert.equal(
  formatPersonDisplayName({ name: 'Jane Smith', email: 'jane@example.com' }, 'id'),
  'Jane Smith'
)
assert.equal(
  formatPersonDisplayName({ name: '', email: 'jane@example.com' }, 'id'),
  'jane@example.com'
)
assert.equal(formatPersonDisplayName(null, 'fallback-id'), 'fallback-id')
assert.equal(questionStoresPersonId({ dynamic_options: 'active_people' }), true)
assert.equal(questionStoresPersonId({ dynamic_options: 'active_people_job_titles' }), false)

console.log('verify-action-photo-and-person-display: ok')
