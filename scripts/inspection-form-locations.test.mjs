import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  RETIRED_BLOCK_LOCATION_MESSAGE,
  resumeDraftWithCurrentBlocks,
  retiredBlockResumeNotice,
} from '../lib/inspection-form-locations.js'

const lakeman = [
  { id: 'blk_000787', name: 'Lakeman Court 1-18', active: false },
  { id: 'blk_001626', name: 'Lakeman Court 1-9', active: true },
  { id: 'blk_001627', name: 'Lakeman Court 10-18', active: true },
]

const chertsey = [
  { id: 'blk_000264', name: 'Chertsey Crescent 155-177', active: false },
  { id: 'blk_001620', name: 'Chertsey Crescent 155-165', active: true },
  { id: 'blk_001621', name: 'Chertsey Crescent 167-177', active: true },
  { id: 'blk_000268', name: 'Chertsey Crescent 56A-76D', active: true },
]

describe('current inspection locations', () => {
  it('offers the active Lakeman Court ranges and leaves the retired grouped block out', () => {
    const names = lakeman.filter((block) => block.active !== false).map((block) => block.name)
    assert.deepEqual(names, ['Lakeman Court 1-9', 'Lakeman Court 10-18'])
    assert.equal(retiredBlockResumeNotice('blk_001626', lakeman), '')
    assert.equal(retiredBlockResumeNotice('blk_000787', lakeman), RETIRED_BLOCK_LOCATION_MESSAGE)
  })

  it('offers the current Chertsey Crescent ranges', () => {
    const names = chertsey.filter((block) => block.active !== false).map((block) => block.name)
    assert.deepEqual(names, [
      'Chertsey Crescent 155-165',
      'Chertsey Crescent 167-177',
      'Chertsey Crescent 56A-76D',
    ])
    assert.equal(retiredBlockResumeNotice('blk_000264', chertsey), RETIRED_BLOCK_LOCATION_MESSAGE)
    assert.equal(retiredBlockResumeNotice('blk_000268', chertsey), '')
  })

  it('keeps answers and photos when a retired block must be chosen again', () => {
    const answers = { q1: 'Yes', q2: 'No' }
    const photos = ['https://example.test/photo-1.jpg', 'https://example.test/photo-2.jpg']
    const restored = resumeDraftWithCurrentBlocks(
      { blockId: 'blk_000787', answers, photos },
      lakeman
    )
    assert.equal(restored.blockId, '')
    assert.equal(restored.notice, RETIRED_BLOCK_LOCATION_MESSAGE)
    assert.deepEqual(restored.answers, answers)
    assert.deepEqual(restored.photos, photos)
    assert.equal(restored.answers, answers)
    assert.equal(restored.photos, photos)
  })
})

describe('new inspection location cache', () => {
  it('loads blocks without using the stored fetch result', () => {
    const page = readFileSync(new URL('../app/inspections/new/page.jsx', import.meta.url), 'utf8')
    const loader = readFileSync(new URL('../lib/load-reference-estates-blocks.js', import.meta.url), 'utf8')
    assert.match(page, /fetchCache\s*=\s*'force-no-store'/)
    assert.match(loader, /noStore\(\)/)
    assert.match(loader, /COALESCE\(active, true\) = true/)
  })
})
