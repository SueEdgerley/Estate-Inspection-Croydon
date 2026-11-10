import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getRoleUiFlags, normalizeJobTitle } from '../lib/app-role-access.js'
import { buildActionListWhere } from '../lib/action-list-filters.js'
import { normalizeStaffJobTitle } from '../lib/staff-job-titles.js'
import {
  actionInRepairsQueue,
  duplicateIdsByAction,
  isRepairsContactAccess,
  personIsRepairsMailbox,
  repairsProgressRejection,
  repairsQueueStatusSql,
  repairsRecordFlags,
  selectRepairsMailbox,
} from '../lib/repairs-contact-rules.js'

const repairsMailbox = {
  id: 'recipient_repairs',
  name: 'Repairs',
  role: null,
  category: 'issue_recipient',
  active: true,
}

describe('Repairs Contact job title', () => {
  it('recognises the job title without treating Repairs Officer as the same role', () => {
    assert.equal(normalizeJobTitle('Repairs Contact'), 'repairs_contact')
    assert.equal(normalizeJobTitle('Repairs Officer'), 'repairs_officer')
    assert.equal(normalizeStaffJobTitle('Repairs Contact'), 'Repairs Contact')
    assert.equal(normalizeStaffJobTitle('Repairs Officer'), 'Repairs Officer')
  })

  it('limits navigation to the repairs queue and leaves other roles unchanged', () => {
    const contact = getRoleUiFlags('user', false, 'Repairs Contact')
    assert.equal(contact.normalizedRole, 'repairs_contact')
    assert.equal(contact.nav.repairsQueue, true)
    assert.equal(contact.nav.inspections, false)
    assert.equal(contact.nav.templates, false)
    assert.equal(contact.nav.analytics, false)
    assert.equal(contact.nav.settings, false)
    assert.equal(contact.nav.actions, false)
    assert.equal(contact.nav.repairsInspector, false)

    const officer = getRoleUiFlags('user', false, 'Repairs Officer')
    assert.equal(officer.nav.inspections, true)
    assert.equal(officer.nav.actions, true)
    assert.equal(officer.nav.templates, true)
    assert.equal(officer.nav.repairsQueue, undefined)

    const caretaker = getRoleUiFlags('user', false, 'Caretaker')
    assert.equal(caretaker.nav.templates, true)
    assert.equal(caretaker.nav.repairsQueue, undefined)

    const admin = getRoleUiFlags('admin', false, 'Repairs Contact')
    assert.equal(admin.isFullAdmin, true)
    assert.equal(admin.nav.settings, true)
  })

  it('applies the restriction only when the job title is Repairs Contact', () => {
    assert.equal(isRepairsContactAccess({ systemRole: 'user', jobTitle: 'repairs_contact', clerkIsAdmin: false }), true)
    assert.equal(isRepairsContactAccess({ systemRole: 'user', jobTitle: 'repairs_officer', clerkIsAdmin: false }), false)
    assert.equal(isRepairsContactAccess({ systemRole: 'user', jobTitle: 'caretaker', clerkIsAdmin: false }), false)
    assert.equal(isRepairsContactAccess({ systemRole: 'owner', jobTitle: 'repairs_contact', clerkIsAdmin: false }), false)
    assert.equal(isRepairsContactAccess({ systemRole: 'admin', jobTitle: 'repairs_contact', clerkIsAdmin: false }), false)
  })
})

describe('Repairs mailbox records', () => {
  it('identifies the mailbox by name or role and ignores the Repairs Officer job title', () => {
    assert.equal(personIsRepairsMailbox(repairsMailbox), true)
    assert.equal(personIsRepairsMailbox({ ...repairsMailbox, name: 'Desk', role: 'Repairs' }), true)
    assert.equal(personIsRepairsMailbox({
      id: 'person_officer',
      name: 'Nyron Nosworthy',
      role: null,
      job_title: 'Repairs Officer',
      category: 'staff',
      active: true,
    }), false)
    const selected = selectRepairsMailbox([
      repairsMailbox,
      { id: 'recipient_fire', name: 'Fire Safety', role: null, category: 'issue_recipient', active: true },
    ])
    assert.equal(selected.mailbox.id, 'recipient_repairs')
    assert.equal(selectRepairsMailbox([repairsMailbox, { ...repairsMailbox, id: 'recipient_other' }]).mailbox, null)
  })

  it('includes the unassigned repairs backlog and mailbox records, not other teams', () => {
    assert.equal(actionInRepairsQueue({ recipient_person_id: 'recipient_repairs', category: 'fire_safety' }, 'recipient_repairs'), true)
    assert.equal(actionInRepairsQueue({ recipient_person_id: null, category: 'repairs' }, 'recipient_repairs'), true)
    assert.equal(actionInRepairsQueue({ recipient_person_id: '', category: 'repairs' }, 'recipient_repairs'), true)
    assert.equal(actionInRepairsQueue({ recipient_person_id: 'recipient_fire', category: 'repairs' }, 'recipient_repairs'), false)
    assert.equal(actionInRepairsQueue({ recipient_person_id: null, category: 'cleaning' }, 'recipient_repairs'), false)
    const where = buildActionListWhere({ status: 'all', repairsMailboxId: 'recipient_repairs', includeFalseActions: true })
    assert.match(where.sql, /a\.recipient_person_id = \$1/)
    assert.match(where.sql, /'repairs'/)
    assert.equal(where.params[0], 'recipient_repairs')
    const unchanged = buildActionListWhere({ status: 'all', includeFalseActions: true })
    assert.equal(unchanged.sql.includes('recipient_person_id'), false)
  })

  it('flags uncertain mailbox categories and possible duplicates without merging them', () => {
    const uncertain = repairsRecordFlags(
      { id: 'action-fire', recipient_person_id: 'recipient_repairs', category: 'fire_safety' },
      'recipient_repairs'
    )
    assert.equal(uncertain[0].type, 'uncertain_ownership')
    const backlog = repairsRecordFlags(
      { id: 'action-repair', recipient_person_id: null, category: 'repairs' },
      'recipient_repairs'
    )
    assert.equal(backlog.length, 0)
    const related = duplicateIdsByAction([
      { id: 'a', block_key: 'block-1', text_key: 'broken door', inspection_id: '', question_id: '' },
      { id: 'b', block_key: 'block-1', text_key: 'broken door', inspection_id: '', question_id: '' },
      { id: 'c', block_key: 'block-2', text_key: 'broken door', inspection_id: '', question_id: '' },
    ])
    assert.deepEqual(related.get('a'), ['b'])
    assert.equal(related.has('c'), false)
    const flagged = repairsRecordFlags({ id: 'a', category: 'repairs' }, 'recipient_repairs', related.get('a'))
    assert.equal(flagged[0].type, 'possible_duplicate')
    assert.equal(repairsQueueStatusSql('outstanding').status, 'outstanding')
    assert.match(repairsQueueStatusSql('completed').sql, /completed/)
  })
})

describe('Repairs Contact progress updates', () => {
  it('allows progress fields and rejects ownership changes', () => {
    assert.equal(repairsProgressRejection({ status: 'completed', repair_notes: 'Door repaired', repair_photo_url: 'https://example.test/photo.jpg' }), null)
    assert.match(repairsProgressRejection({ status: 'completed', recipient_person_id: 'recipient_fire' }), /only change status/)
    assert.match(repairsProgressRejection({ category: 'repairs' }), /only change status/)
    assert.match(repairsProgressRejection({}), /required/)
  })
})
