/**
 * Classifier coverage for the historical false-action dry run.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/false-action-cleanup.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isHighConfidenceEsmFalseAction,
  isHighConfidenceCaretakerQ12FalseAction,
  isHighConfidenceGroundsS3FalseAction,
  isExcludedFromAnalytics,
  withFalseAutoActionAuditNote,
  sqlExcludeFalseAutoActions,
  FALSE_ACTION_VOID_NOTE,
} from '../lib/false-action-cleanup.js'
import { buildActionFilterSql } from '../lib/analytics-payload.js'

describe('historical false-action classifiers', () => {
  it('treats ESM A/B/NA with no comment as false, and C/D or commented records as not false', () => {
    assert.equal(isHighConfidenceEsmFalseAction({ grade: 'A', comment: '' }), true)
    assert.equal(isHighConfidenceEsmFalseAction({ grade: 'B', comment: '' }), true)
    assert.equal(isHighConfidenceEsmFalseAction({ grade: 'NA', comment: '' }), true)
    assert.equal(isHighConfidenceEsmFalseAction({ grade: 'C', comment: '' }), false)
    assert.equal(isHighConfidenceEsmFalseAction({ grade: 'D', comment: 'Needs attention' }), false)
    assert.equal(isHighConfidenceEsmFalseAction({ grade: 'A', comment: 'Broken handrail' }), false)
    assert.equal(isHighConfidenceEsmFalseAction({ grade: 'A', comment: '', raiseIssue: true }), false)
  })

  it('treats Caretaker q12 empty-comment auto-actions as false, commented q12 as not false', () => {
    assert.equal(
      isHighConfidenceCaretakerQ12FalseAction({
        questionId: 'cm_canonical_internal_cleaning_q12',
        autoCreated: true,
        comment: '',
      }),
      true
    )
    assert.equal(
      isHighConfidenceCaretakerQ12FalseAction({
        questionId: 'cm_canonical_internal_cleaning_q12',
        autoCreated: true,
        comment: 'Other cleaning needed in chute room',
      }),
      false
    )
  })

  it('treats Grounds satisfactory-Yes with filler comments as false, litter/bulk wording as not false', () => {
    assert.equal(
      isHighConfidenceGroundsS3FalseAction({ questionId: 'gm_s3_q1', answer: 'Yes', comment: 'NA' }),
      true
    )
    assert.equal(
      isHighConfidenceGroundsS3FalseAction({
        questionId: 'gm_s3_q1',
        answer: 'Yes',
        comment: 'Litter picking required',
      }),
      false
    )
    assert.equal(
      isHighConfidenceGroundsS3FalseAction({ questionId: 'gm_s3_q1', answer: 'No', comment: 'NA' }),
      false
    )
  })
})

describe('Analytics exclusion of false auto-actions', () => {
  it('treats the [FALSE_AUTO_ACTION] marker as excluded from Analytics', () => {
    assert.equal(isExcludedFromAnalytics(''), false)
    assert.equal(isExcludedFromAnalytics('Contractor followed up'), false)
    assert.equal(isExcludedFromAnalytics(FALSE_ACTION_VOID_NOTE), true)
    assert.equal(isExcludedFromAnalytics(`Existing note\n\n${FALSE_ACTION_VOID_NOTE}`), true)
  })

  it('appends the audit note once, without duplicating the marker', () => {
    assert.equal(withFalseAutoActionAuditNote(''), FALSE_ACTION_VOID_NOTE)
    assert.equal(withFalseAutoActionAuditNote(null), FALSE_ACTION_VOID_NOTE)
    const once = withFalseAutoActionAuditNote('Called contractor')
    assert.match(once, /Called contractor/)
    assert.match(once, /\[FALSE_AUTO_ACTION\]/)
    assert.equal(withFalseAutoActionAuditNote(once), once)
  })

  it('builds Analytics action SQL that excludes the marker', () => {
    const sql = sqlExcludeFalseAutoActions('a')
    assert.match(sql, /repair_notes/)
    assert.match(sql, /\[FALSE_AUTO_ACTION\]/)
    const [where] = buildActionFilterSql('status = $1', ['submitted'], '', '', 'all')
    assert.match(where, /repair_notes/)
    assert.match(where, /\[FALSE_AUTO_ACTION\]/)
  })
})
