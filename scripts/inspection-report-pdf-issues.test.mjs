/**
 * Unit tests for PDF issue vs photo-evidence classification.
 * Run: node --test scripts/inspection-report-pdf-issues.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPdfReportableIssue,
  filterWalkaboutIssuesAlreadyInFindings,
} from '../lib/pdf/inspection-report-issue-filter.js'

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

describe('filterWalkaboutIssuesAlreadyInFindings', () => {
  it('drops actions whose questionId already appears in findings', () => {
    const filtered = filterWalkaboutIssuesAlreadyInFindings(
      [
        { questionId: 'ew_it_bulk_refuse_removal', title: 'Bulk', isReportableIssue: true },
        { questionId: 'ew_chk_abc', title: 'Extra', isReportableIssue: true },
        { questionId: 'orphan_only', title: 'Orphan', isReportableIssue: true },
      ],
      [
        {
          questions: [
            { id: 'ew_it_bulk_refuse_removal' },
            { id: 'ew_chk_abc' },
          ],
        },
      ]
    )
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].questionId, 'orphan_only')
  })

  it('keeps actions with no questionId', () => {
    const filtered = filterWalkaboutIssuesAlreadyInFindings(
      [{ questionId: null, title: 'Manual', isReportableIssue: true }],
      [{ questions: [{ id: 'ew_it_graffiti' }] }]
    )
    assert.equal(filtered.length, 1)
  })
})
