/**
 * Sequential issue references and Issues-list filters.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/issue-number.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatIssueReference,
  parseIssueReferenceQuery,
  isExcludedFromIssueNumbering,
} from '../lib/issue-number.js'
import {
  buildActionListWhere,
  normalizeActionListStatus,
  sqlActionListStatusFilter,
} from '../lib/action-list-filters.js'
import { FALSE_ACTION_VOID_NOTE } from '../lib/false-action-cleanup.js'
import { ASSIGN_ISSUE_NUMBERS_SQL } from '../lib/issue-number-backfill.js'

describe('issue references', () => {
  it('formats sequential numbers as ISS-000123', () => {
    assert.equal(formatIssueReference(1), 'ISS-000001')
    assert.equal(formatIssueReference(123), 'ISS-000123')
    assert.equal(formatIssueReference(993), 'ISS-000993')
    assert.equal(formatIssueReference(null), '')
    assert.equal(formatIssueReference(0), '')
  })

  it('parses ISS-000123, ISS-123, and 123', () => {
    assert.equal(parseIssueReferenceQuery('ISS-000123'), 123)
    assert.equal(parseIssueReferenceQuery('ISS-123'), 123)
    assert.equal(parseIssueReferenceQuery('iss000123'), 123)
    assert.equal(parseIssueReferenceQuery('123'), 123)
    assert.equal(parseIssueReferenceQuery(' leak '), null)
  })

  it('excludes [FALSE_AUTO_ACTION] rows from numbering', () => {
    assert.equal(isExcludedFromIssueNumbering(''), false)
    assert.equal(isExcludedFromIssueNumbering(FALSE_ACTION_VOID_NOTE), true)
  })
})

describe('Issues list filters and counts', () => {
  it('defaults unknown status to Active (open + in progress)', () => {
    assert.equal(normalizeActionListStatus(null), 'active')
    assert.equal(normalizeActionListStatus('in progress'), 'in_progress')
    const active = sqlActionListStatusFilter('active')
    assert.match(active, /open/)
    assert.match(active, /in_progress/)
  })

  it('excludes false auto-actions from normal list totals, including Closed and All', () => {
    for (const status of ['active', 'closed', 'all']) {
      const where = buildActionListWhere({ status, startIndex: 1 })
      assert.match(where.sql, /FALSE_AUTO_ACTION/)
      assert.match(where.sql, /strpos/)
    }
  })

  it('keeps false rows only when includeFalseActions is set', () => {
    const hidden = buildActionListWhere({ status: 'all', startIndex: 1 })
    const shown = buildActionListWhere({ status: 'all', startIndex: 1, includeFalseActions: true })
    assert.match(hidden.sql, /FALSE_AUTO_ACTION/)
    assert.equal(shown.sql.includes('FALSE_AUTO_ACTION'), false)
  })

  it('searches issue numbers from ISS references and uses distinct-id count SQL', () => {
    const where = buildActionListWhere({ status: 'active', search: 'ISS-000123', startIndex: 1 })
    assert.equal(where.params[0], 123)
    assert.match(where.sql, /a\.issue_number = \$1/)
  })
})

describe('issue-number backfill', () => {
  it('numbers only unnumbered genuine rows in created_at order and skips false markers', () => {
    assert.match(ASSIGN_ISSUE_NUMBERS_SQL, /ROW_NUMBER\(\) OVER \(ORDER BY a\.created_at ASC, a\.id ASC\)/)
    assert.match(ASSIGN_ISSUE_NUMBERS_SQL, /issue_number IS NULL/)
    assert.match(ASSIGN_ISSUE_NUMBERS_SQL, /FALSE_AUTO_ACTION/)
  })
})
