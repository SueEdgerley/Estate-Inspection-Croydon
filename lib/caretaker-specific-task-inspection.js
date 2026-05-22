/** Caretaker-only: full vs specific-task inspection scope helpers. */

export const CARETAKER_INSPECTION_MODE_FULL = 'full'
export const CARETAKER_INSPECTION_MODE_SPECIFIC = 'specific_task'

export const CARETAKER_SPECIFIC_TASK_QUESTION_OPTION_PREFIX = 'stq:'

/** Questions inside a section that appear as their own specific-task dropdown option. */
const CARETAKER_SPECIFIC_TASK_QUESTION_TARGETS = [
  {
    label: 'Refuse Chutes/Bin Chambers',
    matchQuestion: (question) => {
      const text = String(question?.label || question?.question_text || '')
        .trim()
        .toLowerCase()
      return text === 'refuse chutes/bin chambers'
    },
  },
]

const SCOPE_PREFIX = '[Caretaker scope:'

function normalizeScopeTitle(title) {
  return String(title || '').trim()
}

export function stripCaretakerSectionNumber(title) {
  const text = String(title || '').trim()
  return text.replace(/^\s*\d+\.\s*/, '').trim() || text
}

export function formatCaretakerScopeLabel(mode, sectionTitle, scopeTitle) {
  if (mode === CARETAKER_INSPECTION_MODE_SPECIFIC) {
    const display =
      normalizeScopeTitle(scopeTitle) || stripCaretakerSectionNumber(sectionTitle)
    if (display) return `Specific task inspection: ${display}`
  }
  return 'Full inspection'
}

/** Shorter label for inspection lists (PDF/report headers use {@link formatCaretakerScopeLabel}). */
export function formatCaretakerListScopeLabel(mode, sectionTitle, scopeTitle) {
  if (mode === CARETAKER_INSPECTION_MODE_SPECIFIC) {
    const display =
      normalizeScopeTitle(scopeTitle) || stripCaretakerSectionNumber(sectionTitle)
    if (display) return `Specific task: ${display}`
  }
  return null
}

export function getCaretakerInspectionModeListLabel(scope) {
  if (!scope || scope.mode !== CARETAKER_INSPECTION_MODE_SPECIFIC) return null
  return formatCaretakerListScopeLabel(scope.mode, scope.sectionTitle, scope.scopeTitle)
}

export function isCaretakerSpecificTaskQuestionOption(selectionId) {
  return String(selectionId || '').startsWith(CARETAKER_SPECIFIC_TASK_QUESTION_OPTION_PREFIX)
}

function buildCaretakerSpecificTaskQuestionOptionId(questionId) {
  return `${CARETAKER_SPECIFIC_TASK_QUESTION_OPTION_PREFIX}${String(questionId)}`
}

function findCaretakerSpecificTaskQuestionTarget(question) {
  return CARETAKER_SPECIFIC_TASK_QUESTION_TARGETS.find((target) => target.matchQuestion(question)) || null
}

/** Resolve dropdown selection (section id or stq:questionId) to scope metadata. */
export function resolveCaretakerSpecificTaskSelection(selectionId, sections) {
  const id = String(selectionId || '').trim()
  if (!id) return null

  if (isCaretakerSpecificTaskQuestionOption(id)) {
    const questionId = id.slice(CARETAKER_SPECIFIC_TASK_QUESTION_OPTION_PREFIX.length)
    for (const section of sections || []) {
      const question = (section.questions || []).find((q) => String(q?.id || '') === questionId)
      if (!question) continue
      const target = findCaretakerSpecificTaskQuestionTarget(question)
      return {
        selectionId: id,
        sectionId: String(section.id),
        questionId,
        scopeTitle: target?.label || stripCaretakerSectionNumber(question.label || question.question_text || ''),
        sectionTitle: String(section.title || section.name || ''),
      }
    }
    return null
  }

  const section = (sections || []).find((s) => String(s?.id || '') === id)
  if (!section) return null
  return {
    selectionId: id,
    sectionId: id,
    questionId: null,
    scopeTitle: null,
    sectionTitle: String(section.title || section.name || ''),
  }
}

/** Dropdown value for a stored specific-task scope. */
export function caretakerSpecificTaskSelectionIdFromScope(scope) {
  if (!scope || scope.mode !== CARETAKER_INSPECTION_MODE_SPECIFIC) return ''
  if (scope.questionId) return buildCaretakerSpecificTaskQuestionOptionId(scope.questionId)
  return scope.sectionId ? String(scope.sectionId) : ''
}

/** Dropdown options from rendered caretaker sections plus configured question-level tasks. */
export function getCaretakerSectionOptions(sections) {
  const sectionOptions = (sections || [])
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

  const questionOptions = []
  for (const section of sections || []) {
    for (const question of section.questions || []) {
      if (question?.nv_hidden || question?.esm_hidden) continue
      const target = findCaretakerSpecificTaskQuestionTarget(question)
      if (!target) continue
      questionOptions.push({
        id: buildCaretakerSpecificTaskQuestionOptionId(question.id),
        title: target.label,
        label: target.label,
        sectionId: String(section.id),
        questionId: String(question.id),
      })
    }
  }

  return [...sectionOptions, ...questionOptions]
}

export function encodeCaretakerScopeInDescription(userDescription, scope) {
  const user = String(userDescription || '').trim()
  if (!scope || scope.mode !== CARETAKER_INSPECTION_MODE_SPECIFIC || !scope.sectionId) {
    return user || undefined
  }
  const payload = {
    mode: CARETAKER_INSPECTION_MODE_SPECIFIC,
    sectionId: String(scope.sectionId),
    sectionTitle: String(scope.sectionTitle || ''),
  }
  if (scope.scopeTitle) payload.scopeTitle = String(scope.scopeTitle)
  if (scope.questionId) payload.questionId = String(scope.questionId)
  const prefix = `${SCOPE_PREFIX}${JSON.stringify(payload)}]`
  return user ? `${prefix}\n\n${user}` : prefix
}

function buildScopeResult(parsed, userDescription) {
  const sectionTitle = String(parsed.sectionTitle || 'Selected section')
  const scopeTitle = normalizeScopeTitle(parsed.scopeTitle) || null
  const questionId = parsed.questionId ? String(parsed.questionId) : null
  return {
    mode: CARETAKER_INSPECTION_MODE_SPECIFIC,
    scopeLabel: formatCaretakerScopeLabel(
      CARETAKER_INSPECTION_MODE_SPECIFIC,
      sectionTitle,
      scopeTitle
    ),
    sectionId: String(parsed.sectionId),
    sectionTitle,
    scopeTitle,
    questionId,
    userDescription,
  }
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
      scopeTitle: null,
      questionId: null,
    }
  }
  try {
    const parsed = JSON.parse(match[1])
    const userDescription = (match[2] || '').trim()
    if (parsed.mode === CARETAKER_INSPECTION_MODE_SPECIFIC && parsed.sectionId) {
      return buildScopeResult(parsed, userDescription)
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
    scopeTitle: null,
    questionId: null,
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
    const resolvedScopeTitle = normalizeScopeTitle(source.caretaker_specific_scope_title) || null
    const questionId = source.caretaker_specific_question_id
      ? String(source.caretaker_specific_question_id)
      : null
    return {
      mode: CARETAKER_INSPECTION_MODE_SPECIFIC,
      sectionId: String(source.caretaker_specific_section_id),
      sectionTitle,
      scopeTitle: resolvedScopeTitle,
      questionId,
      scopeLabel: formatCaretakerScopeLabel(
        CARETAKER_INSPECTION_MODE_SPECIFIC,
        sectionTitle,
        resolvedScopeTitle
      ),
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

/** When a specific question is scoped, limit validation/rendering to that question. */
export function caretakerQuestionInScope(question, scope) {
  if (!scope || scope.mode !== CARETAKER_INSPECTION_MODE_SPECIFIC || !scope.questionId) return true
  return String(question?.id || '') === String(scope.questionId)
}
