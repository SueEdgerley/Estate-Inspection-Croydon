export const STAFF_JOB_TITLES = [
  'Estate Services Manager',
  'Housing Officer',
  'Housing Team Manager',
  'Caretaker',
  'Resident Representative',
  'Resident Involvement Officer',
  'Ward Councillor',
  'Repairs Officer',
  'Concierge',
  'Other',
]

export function normalizeStaffJobTitle(raw) {
  const value = raw != null ? String(raw).trim() : ''
  if (!value) return null
  return STAFF_JOB_TITLES.find((title) => title.toLowerCase() === value.toLowerCase()) || null
}
