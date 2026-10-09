/**
 * Walkabout end time must not be filled with recovery/submit time.
 * Run: node --test scripts/walkabout-inspection-timing.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveSubmittedInspectionEndTime,
  resolveWalkaboutInspectionEndTime,
  walkaboutDurationLabel,
} from '../lib/walkabout-inspection-timing.js'

describe('Walkabout end time', () => {
  it('keeps an unknown original finish time blank instead of using recovery/submit now', () => {
    const recoveredAt = new Date('2026-10-08T16:45:00.000Z')
    assert.equal(
      resolveWalkaboutInspectionEndTime({
        requestEndTime: null,
        storedEndTime: null,
      }),
      null
    )
    assert.equal(
      resolveSubmittedInspectionEndTime({
        isWalkabout: true,
        requestEndTime: null,
        storedEndTime: null,
        submittedAt: recoveredAt,
      }),
      null
    )
  })

  it('keeps an officer-entered original finish time', () => {
    const originalEnd = new Date('2026-10-06T12:51:00.000Z')
    const recoveredAt = new Date('2026-10-08T16:45:00.000Z')
    const resolved = resolveSubmittedInspectionEndTime({
      isWalkabout: true,
      requestEndTime: originalEnd,
      storedEndTime: null,
      submittedAt: recoveredAt,
    })
    assert.equal(resolved.toISOString(), originalEnd.toISOString())
  })

  it('does not invent a duration from the recovery clock when end time is blank', () => {
    assert.equal(
      walkaboutDurationLabel('2026-10-06T12:18:00.000Z', ''),
      ''
    )
    assert.equal(
      walkaboutDurationLabel('2026-10-06T12:18:00.000Z', '2026-10-06T12:51:00.000Z'),
      '33m'
    )
  })

  it('non-Walkabout forms still default a missing end time to submit time', () => {
    const submittedAt = new Date('2026-10-08T16:45:00.000Z')
    const resolved = resolveSubmittedInspectionEndTime({
      isWalkabout: false,
      requestEndTime: null,
      storedEndTime: null,
      submittedAt,
    })
    assert.equal(resolved.toISOString(), submittedAt.toISOString())
  })

  it('Neighbourhood Voice still stores no start or end time', () => {
    const submittedAt = new Date('2026-10-08T16:45:00.000Z')
    const resolved = resolveSubmittedInspectionEndTime({
      isNeighbourhoodVoice: true,
      isWalkabout: false,
      requestEndTime: submittedAt,
      storedEndTime: submittedAt,
      submittedAt,
    })
    assert.equal(resolved, null)
  })

  it('Caretaker and ESM keep an officer-entered finish time', () => {
    const originalEnd = new Date('2026-09-12T09:40:00.000Z')
    const submittedAt = new Date('2026-09-12T10:05:00.000Z')
    const resolved = resolveSubmittedInspectionEndTime({
      isWalkabout: false,
      requestEndTime: originalEnd,
      storedEndTime: null,
      submittedAt,
    })
    assert.equal(resolved.toISOString(), originalEnd.toISOString())
  })
})
