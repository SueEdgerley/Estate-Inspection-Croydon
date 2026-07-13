/**
 * Unit tests for PDF issue vs photo-evidence classification.
 * Run: node --test scripts/inspection-report-pdf-issues.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isPdfReportableIssue } from '../lib/pdf/inspection-report-issue-filter.js'

describe('isPdfReportableIssue — photos alone are not issues', () => {
  it('excludes ESM photo-comment evidence when rating is A', () => {
    assert.equal(
      isPdfReportableIssue(
        { category: 'esm_photo_comment_issue', question_id: 'q1', auto_created: true },
        { q1: 'A' }
      ),
      false
    )
  })

  it('excludes auto-created good-grade photo findings', () => {
    assert.equal(
      isPdfReportableIssue(
        { category: 'esm_external_cleaning', question_id: 'q1', auto_created: true },
        { q1: 'B' }
      ),
      false
    )
  })

  it('includes Yes findings', () => {
    assert.equal(
      isPdfReportableIssue(
        { category: 'health_safety', question_id: 'q1', auto_created: true },
        { q1: 'Yes' }
      ),
      true
    )
  })

  it('includes C/D grade findings', () => {
    assert.equal(
      isPdfReportableIssue(
        { category: 'esm_photo_comment_issue', question_id: 'q1', auto_created: true },
        { q1: 'C' }
      ),
      true
    )
  })

  it('includes non-photo genuine categories without a good grade', () => {
    assert.equal(
      isPdfReportableIssue({ category: 'graffiti', question_id: 'q1', auto_created: false }, { q1: '' }),
      true
    )
  })
})
