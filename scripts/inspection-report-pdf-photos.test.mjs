/**
 * Unit tests for multi-photo PDF grid metrics.
 * Run: node --test scripts/inspection-report-pdf-photos.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { photoGridMetrics } from '../lib/pdf/photo-grid-metrics.js'

describe('photoGridMetrics', () => {
  const cellW = 180

  it('returns zero height for no photos', () => {
    const m = photoGridMetrics(0, cellW)
    assert.equal(m.rows, 0)
    assert.equal(m.height, 0)
  })

  it('uses a single large frame for one photo', () => {
    const m = photoGridMetrics(1, cellW)
    assert.equal(m.cols, 1)
    assert.equal(m.rows, 1)
    assert.ok(m.height > 50)
  })

  it('wraps multiple photos into a grid without dropping any from the layout math', () => {
    const m = photoGridMetrics(3, cellW)
    assert.equal(m.cols, 2)
    assert.equal(m.rows, 2) // 2 on first row, 1 on second
    assert.ok(m.height > photoGridMetrics(1, cellW).height)
  })

  it('keeps four photos in two rows of two', () => {
    const m = photoGridMetrics(4, cellW)
    assert.equal(m.cols, 2)
    assert.equal(m.rows, 2)
  })
})
