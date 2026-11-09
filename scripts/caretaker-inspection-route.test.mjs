import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { caretakerLegacyInspectionRedirect } from '../lib/caretaker-inspection-route.js'

describe('caretaker inspection redirect', () => {
  it('keeps the saved inspection id', () => {
    assert.equal(
      caretakerLegacyInspectionRedirect('/inspections/b67a10d0-6553-4ef1-942a-e51baaa001a7'),
      '/caretaker/inspections/b67a10d0-6553-4ef1-942a-e51baaa001a7'
    )
  })

  it('keeps a query string used to open follow-up notes', () => {
    assert.equal(
      caretakerLegacyInspectionRedirect('/inspections/inspection-1', '?addUpdate=1'),
      '/caretaker/inspections/inspection-1?addUpdate=1'
    )
  })

  it('leaves the new inspection form on its own address', () => {
    assert.equal(caretakerLegacyInspectionRedirect('/inspections/new'), null)
  })

  it('leaves the caretaker report address unchanged', () => {
    assert.equal(caretakerLegacyInspectionRedirect('/caretaker/inspections/inspection-1'), null)
  })
})
