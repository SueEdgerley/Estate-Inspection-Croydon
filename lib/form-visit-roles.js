/**
 * Job titles used inside inspection forms.
 *
 * These are deliberately separate from app access roles in `users.role`.
 * App roles control permissions; form visit roles describe who attended a visit.
 */
export const FORM_VISIT_ROLES = [
  'Estate Services Manager',
  'Housing Officer',
  'Caretaker',
  'Resident Representative',
  'Ward Councillor',
  'Repairs Officer',
  'Concierge',
  'Other',
]

export const FORM_VISIT_ROLE_OPTIONS = FORM_VISIT_ROLES.map((role) => ({
  value: role,
  label: role,
}))
