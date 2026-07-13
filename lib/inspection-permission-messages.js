/**
 * User-facing copy for inspection create/submit permission failures.
 * Keep create/submit API and form clients aligned so officers see the same guidance.
 */

export const NO_FORMS_FOR_ROLE_MESSAGE =
  'No forms are available for your account yet. Ask an administrator to assign your role (for example Housing Officer for Estate Walkabouts). Do not start filling a form until your role is set — otherwise your work may not be saved.'

export const FORM_NOT_PERMITTED_MESSAGE =
  'Your account does not have permission to use this form. Ask an administrator to assign the correct role before starting. This inspection has not been saved.'

export const ROLE_CANNOT_USE_TEMPLATE_API_MESSAGE =
  'Your account does not have permission to use this form. Ask an administrator to assign the correct role (for example Housing Officer for Estate Walkabouts). This inspection has not been saved.'

export const ROLE_CANNOT_SUBMIT_API_MESSAGE =
  'Your account does not have permission to submit this inspection type. Ask an administrator to assign the correct role. This inspection has not been saved.'

/**
 * Build a visible client-side save-failure message.
 * @param {{ status?: number, serverError?: string, savedLocally?: boolean }} opts
 */
export function formatInspectionSaveFailureMessage({ status, serverError, savedLocally = false } = {}) {
  const server = String(serverError || '').trim()
  const isForbidden = status === 403 || /forbidden|cannot use this form|cannot submit this inspection/i.test(server)
  const isUnauthorised = status === 401

  let message
  if (isUnauthorised) {
    message =
      'Please sign in at the top of the page, then try submitting again. This inspection has not been saved on the server.'
  } else if (isForbidden) {
    message =
      server ||
      ROLE_CANNOT_USE_TEMPLATE_API_MESSAGE
    if (!/has not been saved/i.test(message)) {
      message = `${message} This inspection has not been saved.`
    }
  } else {
    message = server || (status ? `Request failed (${status}). This inspection has not been saved.` : 'Save failed. This inspection has not been saved.')
    if (!/has not been saved/i.test(message)) {
      message = `${message} This inspection has not been saved.`
    }
  }

  if (savedLocally) {
    message = `${message} A local draft has been saved on this device so your work is not lost — after your role is fixed, reopen this draft and submit again.`
  }

  return message
}
