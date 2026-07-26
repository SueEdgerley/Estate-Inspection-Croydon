/**
 * Walkabout checklist PDF expansion checks.
 * Run: node --test scripts/walkabout-checklist-pdf.test.mjs
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildWalkaboutChecklistPdfRows,
  isWalkaboutChecklistQuestionId,
  looksLikeWalkaboutChecklistJson,
  parseWalkaboutChecklistAnswer,
} from '../lib/pdf/walkabout-checklist-pdf.js'

describe('walkabout checklist PDF expansion', () => {
  it('identifies the checklist question id', () => {
    assert.equal(isWalkaboutChecklistQuestionId('ew_checklist_json'), true)
    assert.equal(isWalkaboutChecklistQuestionId('ew_q_responsible'), false)
  })

  it('parses checklist JSON and expands readable rows with photos', () => {
    const raw = JSON.stringify([
      {
        id: 'b80dde9d-3e07-4473-a0ea-1f5c74437312',
        description: 'Notice board',
        photo_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'],
        action_required: true,
        action_summary: 'Replace',
        order_raised_number: 'WO-9',
      },
    ])
    assert.equal(looksLikeWalkaboutChecklistJson(raw), true)
    const items = parseWalkaboutChecklistAnswer(raw)
    const { questions, photos } = buildWalkaboutChecklistPdfRows(items, {
      responsibleOfficerName: 'Jane Smith',
    })
    assert.equal(questions.length, 1)
    assert.equal(questions[0].text.split('\n')[0], 'Notice board')
    assert.match(questions[0].text, /Action required: Yes/)
    assert.match(questions[0].text, /Action summary: Replace/)
    assert.match(questions[0].text, /Order reference: WO-9/)
    assert.match(questions[0].text, /Responsible officer: Jane Smith/)
    assert.equal(questions[0].rating, 'Yes')
    assert.equal(questions[0].resultMode, 'simple_yes_no')
    assert.equal(photos.length, 3)
    assert.ok(!questions[0].text.includes('https://example.com'))
    assert.ok(!questions[0].text.includes('b80dde9d'))
  })
})
