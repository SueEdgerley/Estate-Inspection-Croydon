/** Caretaker-only: full vs specific-task inspection scope helpers. */

export const CARETAKER_INSPECTION_MODE_FULL = 'full'
export const CARETAKER_INSPECTION_MODE_SPECIFIC = 'specific_task'

const SCOPE_PREFIX = '[Caretaker scope:'

export function stripCaretakerSectionNumber(title) {
  const text = String(title || '').trim()
  return text.replace(/^\s*\d+\.\s*/, '').trim() || text
}

export function formatCaretakerScopeLabel(mode, sectionTitle) {
  if (mode === CARETAKER_INSPECTION_MODE_SPECIFIC && sectionTitle) {
    return `Specific task inspection: ${stripCaretakerSectionNumber(sectionTitle)}`
  }
  return 'Full inspection'
}

/** Dropdown options from rendered caretaker sections. */
export function getCaretakerSectionOptions(sections) {
  return (sections || [])
    .filter((section) => {
      const questions = Array.isArray(section?.questions) ? section.questions : []
      return questions.some((q) => !q?.nv_hidden && !q?.esm_hidden)
    })
    .map((section) => {
      const title = String(section.title || section.name || 'Section').trim()
      return {
        id: String(section.id),
        title,
        label: stripCaretakerSectionNumber(title) || title,
      }
    })
}

export function encodeCaretakerScopeInDescription(userDescription, scope) {
  const user = String(userDescription || '').trim()
  if (!scope || scope.mode !== CARETAKER_INSPECTION_MODE_SPECIFIC || !scope.sectionId) {
    return user || undefined
  }
  const payload = JSON.stringify({
    mode: CARETAKER_INSPECTION_MODE_SPECIFIC,
    sectionId: String(scope.sectionId),
    sectionTitle: String(scope.sectionTitle || ''),
  })
  const prefix = `${SCOPE_PREFIX}${payload}]`
  return user ? `${prefix}\n\n${user}` : prefix
}

export function parseCaretakerScopeFromDescription(description) {
  const text = String(description || '')
  const match = text.match(/^\[Caretaker scope:(\{[\s\S]*?\})\](?:\n\n([\s\S]*))?$/)
  if (!match) {
    return {
      mode: CARETAKER_INSPECTION_MODE_FULL,
      scopeLabel: 'Full inspection',
      userDescription: text,
      sectionId: null,
      sectionTitle: null,
    }
  }
  try {
    const parsed = JSON.parse(match[1])
    const userDescription = (match[2] || '').trim()
    if (parsed.mode === CARETAKER_INSPECTION_MODE_SPECIFIC && parsed.sectionId) {
      const sectionTitle = parsed.sectionTitle || 'Selected section'
      return {
        mode: CARETAKER_INSPECTION_MODE_SPECIFIC,
        scopeLabel: formatCaretakerScopeLabel(CARETAKER_INSPECTION_MODE_SPECIFIC, sectionTitle),
        sectionId: String(parsed.sectionId),
        sectionTitle: String(parsed.sectionTitle || ''),
        userDescription,
      }
    }
  } catch {
    // fall through to full inspection
  }
  return {
    mode: CARETAKER_INSPECTION_MODE_FULL,
    scopeLabel: 'Full inspection',
    userDescription: text,
    sectionId: null,
    sectionTitle: null,
  }
}

/** Resolve scope from stored description and/or explicit submit-body fields. */
export function resolveCaretakerInspectionScope(source) {
  if (!source) return parseCaretakerScopeFromDescription('')
  if (
    source.caretaker_inspection_mode === CARETAKER_INSPECTION_MODE_SPECIFIC &&
    source.caretaker_specific_section_id
  ) {
    const sectionTitle = String(source.caretaker_specific_section_title || '')
    return {
      mode: CARETAKER_INSPECTION_MODE_SPECIFIC,
      sectionId: String(source.caretaker_specific_section_id),
      sectionTitle,
      scopeLabel: formatCaretakerScopeLabel(CARETAKER_INSPECTION_MODE_SPECIFIC, sectionTitle),
      userDescription: parseCaretakerScopeFromDescription(source.description).userDescription,
    }
  }
  return parseCaretakerScopeFromDescription(source.description)
}

/** When scope is full, all sections apply; otherwise only the selected section. */
export function caretakerSectionInScope(section, scope) {
  if (!scope || scope.mode !== CARETAKER_INSPECTION_MODE_SPECIFIC || !scope.sectionId) return true
  return String(section?.id || '') === String(scope.sectionId)
}
