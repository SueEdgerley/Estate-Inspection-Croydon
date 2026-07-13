import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  REPORT_VARIANTS,
  reportColumnLabels,
  resolveInspectionReportVariant,
  resolvePdfResultMode,
} from '../lib/pdf/inspection-report-variant.js'

describe('inspection report variants', () => {
  it('detects caretaker inspections', () => {
    assert.equal(
      resolveInspectionReportVariant({ template_name: 'Caretaker Inspection' }, null),
      REPORT_VARIANTS.CARETAKER
    )
  })

  it('detects walkabout from template version', () => {
    assert.equal(
      resolveInspectionReportVariant(
        { template_name: 'Estate Walkabout' },
        { template_key: 'estate_walkabout', name: 'Estate Walkabout' }
      ),
      REPORT_VARIANTS.WALKABOUT
    )
  })

  it('detects ESM from template version', () => {
    assert.equal(
      resolveInspectionReportVariant(
        { template_name: 'ESM Inspection Form' },
        { name: 'ESM Inspection Form', template_type: 'esm' }
      ),
      REPORT_VARIANTS.ESM
    )
  })

  it('uses caretaker column labels', () => {
    const labels = reportColumnLabels(REPORT_VARIANTS.CARETAKER)
    assert.equal(labels.question, 'Inspection Item')
    assert.equal(labels.middle, 'Result')
  })

  it('uses walkabout column labels', () => {
    const labels = reportColumnLabels(REPORT_VARIANTS.WALKABOUT)
    assert.equal(labels.question, 'Question / Observation')
    assert.equal(labels.middle, 'Rating')
  })

  it('maps result modes without inventing grades', () => {
    assert.equal(resolvePdfResultMode({ grading_scheme_name: 'A-D' }, 'A'), 'grade')
    assert.equal(resolvePdfResultMode({ action_trigger_on: 'yes', question_type: 'yes_no' }, 'Yes'), 'issue_yes_no')
    assert.equal(resolvePdfResultMode({ question_type: 'yes_no' }, 'No'), 'task_yes_no')
  })
})
