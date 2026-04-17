import { getNvGradedMeta } from './neighbourhood-voice-question-schema.js'

/**
 * In-memory patches for the Neighbourhood Voice template only.
 *
 * - Q1–Q23: `nv_standard` — A/B/C/D/NA + comment + photo (all three required when a grade is chosen).
 * - **EF** (synthetic): Estate Feedback (Resident Insight) — five prompts, comment, optional photo (no grading).
 * - Q24: `nv_issues_report` — **Issues to report only** (copy/order from Airtable Template Questions rows 188–192);
 *   photo and location UI only when Yes; stored on `q.nv_q24_airtable_rows`.
 * - Q25: `nv_q25` — **Sign-off only** (explicit titles; helper text cleared so nothing bleeds from Q24).
 *
 * Misplaced estate / sign-off / duplicate Issues rows are marked `nv_hidden`. Other templates unchanged.
 *
 * Issue routing metadata is copied from neighbourhood-voice-question-schema (not inferred in React).
 */

/**
 * Neighbourhood Voice — Template Questions rows 188–192 ("Issues to report" block).
 * Order: intro, properties Y/N prompt, vehicles Y/N prompt, extra-detail comment prompt, photo + location prompt.
 * Update these strings if the Airtable base copy changes.
 */
export const NV_Q24_AIRTABLE_ROWS_188_192 = [
  'Use this section only if you want to report problems that are not covered by the inspection questions above.',
  'Are there any empty or abandoned properties, garages, sheds or other spaces that are causing concern or attracting anti-social behaviour?',
  'Are there any abandoned vehicles that are causing an obstruction or a safety issue?',
  'If you need to, use the box below to give more detail (for example where the issue is or how long it has been going on).',
  'If you answered Yes to either question above, please add a clear photo if you can. You can also use the button below to share your approximate location (optional).',
]

/** @deprecated Use NV_Q24_AIRTABLE_ROWS_188_192; kept for any legacy `nv_q24` snapshot references */
export const NV_Q24_INSTRUCTION_ROWS = NV_Q24_AIRTABLE_ROWS_188_192

export const NV_Q24_GEO_HELPER = NV_Q24_AIRTABLE_ROWS_188_192[4]

function isNeighbourhoodVoiceTemplateLocal(template) {
  if (!template) return false
  const key = (template.template_key ?? template['Template Key'] ?? '').toString().toLowerCase().trim()
  const name = (template.name ?? '').toString().toLowerCase().trim()
  if (key === 'nv' || key === 'neighbourhood_voice' || key === 'neighbourhood voice') return true
  if (name.includes('neighbourhood voice') || name.includes('neighbourhood voices')) return true
  return false
}

export const NV_ESTATE_FEEDBACK_PROMPTS = [
  'Are there places on the estate where you feel unsafe or unwelcome?',
  'Is there anything about the design or upkeep of the estate that makes daily life harder?',
  'How easy is it to find out who to contact if something needs fixing or you need help?',
  'What one change would make the biggest difference to how you feel about where you live?',
  'Is there anything else you want us to know about your estate or block?',
]

function nvKeyForQuestion(_q, orderIndex) {
  return `Q${orderIndex}`
}

function stripGradingMetadata(q) {
  delete q.grading_scheme_id
  delete q.grading_scheme_name
  q.grading_options = []
}

function stripOptionsForTextAnswer(q) {
  q.options = []
}

function applyNvIssueMetaFromSchema(q, nvKey) {
  const meta = getNvGradedMeta(nvKey)
  if (!meta) return
  q._nv_key = nvKey
  q._nv_section_key = meta.section_key
  q._nv_issue_category = meta.issue_category
  q._nv_issue_type = meta.issue_type
  q._nv_suggested_team_role = meta.suggested_team_role
  q._nv_create_issue_on_c = !!meta.create_issue_on_c
  q._nv_default_priority_d = meta.default_priority_d || 'medium'
  q._nv_default_priority_c = meta.default_priority_c || 'low'
}

function applyNvStandard(q, gradingFromQ8, nvKey) {
  q.question_type = 'graded'
  q.question_type_raw = 'graded'
  q.grading_scheme_id = gradingFromQ8.grading_scheme_id
  q.grading_scheme_name = gradingFromQ8.grading_scheme_name
  q.grading_options = [...(gradingFromQ8.grading_options || ['A', 'B', 'C', 'D', 'NA'])]
  q.nv_render_kind = 'nv_standard'
  q.nv_graded_require_comment_photo = false
  q.nv_graded_require_comment_only = false
  q.photo_required_when = undefined
  q.type_includes_photo = false
  q.comment_required_when = undefined
  if (nvKey) applyNvIssueMetaFromSchema(q, nvKey)
}

function applyNvIssuesReport(q) {
  q.nv_issues_report = true
  q.nv_render_kind = 'nv_issues_report'
  q.question_type = 'long_text'
  q.question_type_raw = 'long_text'
  stripGradingMetadata(q)
  stripOptionsForTextAnswer(q)
  q.nv_q24_airtable_rows = [...NV_Q24_AIRTABLE_ROWS_188_192]
  q.question_text = 'Issues to report'
  q.resident_wording = 'Issues to report'
  // All Q24 copy lives in nv_q24_airtable_rows / UI; do not merge legacy helper blobs from Airtable.
  q.helper_text = ''
}

function applyNvSignoff(q) {
  q.nv_q25 = true
  q.nv_render_kind = 'nv_q25'
  q.nv_q25_signoff_only = true
  q.question_type = 'text'
  q.question_type_raw = 'text'
  stripGradingMetadata(q)
  stripOptionsForTextAnswer(q)
  q.photo_required_when = undefined
  q.type_includes_photo = false
  q.comment_required_when = undefined
  q.question_text = 'Sign-off'
  q.resident_wording = 'Sign-off'
  q.helper_text = ''
}

function applyNvEstateFeedbackSynthetic(q) {
  q.nv_estate_feedback = true
  q.nv_render_kind = 'nv_estate_feedback'
  q.question_type = 'long_text'
  q.question_type_raw = 'long_text'
  stripGradingMetadata(q)
  stripOptionsForTextAnswer(q)
  q.nv_estate_feedback_prompts = [...NV_ESTATE_FEEDBACK_PROMPTS]
  q.question_text = 'Estate Feedback (Resident Insight)'
  q.resident_wording = q.question_text
}

function shouldHideAsMisplacedEstateRow(q, sectionTitle) {
  const st = (sectionTitle || '').toLowerCase()
  if (!/window|windows/.test(st)) return false
  const blob = `${q.resident_wording || ''} ${q.question_text || ''}`.toLowerCase()
  return NV_ESTATE_FEEDBACK_PROMPTS.some((p) => {
    const needle = p.slice(0, 40).toLowerCase()
    return blob.includes(needle)
  })
}

function isSignOffSectionTitle(sectionTitle) {
  const st = (sectionTitle || '').toLowerCase()
  return st.includes('sign') && (st.includes('off') || st.includes('out'))
}

/** Sign-off prompts must not appear under Window Cleaning / Q22–Q23. */
function shouldHideMisplacedSignoffRow(q, sectionTitle) {
  if (isSignOffSectionTitle(sectionTitle)) return false
  const blob = `${q.resident_wording || ''} ${q.question_text || ''}`.toLowerCase()
  const hints = [
    'confirm this feedback',
    'accurate to the best of my knowledge',
    'date of this visit',
    'name as it should appear',
    'sign-off',
    'sign off',
  ]
  return hints.some((h) => blob.includes(h))
}

function isIssuesToReportSection(sec) {
  const t = `${sec.title || ''} ${sec.name || ''}`.toLowerCase()
  if (t.includes('issues to report')) return true
  if (t.includes('issue') && t.includes('report')) return true
  return false
}

/**
 * Leave a single primary row per NV tail section so Q24 / Q25 do not bleed into extra wizard steps.
 */
function hideDuplicateTailSectionQuestions(template) {
  for (const sec of template.sections || []) {
    const visible = (sec.questions || []).filter((q) => !q.nv_hidden)
    if (visible.length <= 1) continue

    if (isIssuesToReportSection(sec)) {
      const blob = (q) => `${q.question_text || ''} ${q.resident_wording || ''}`.toLowerCase()
      const keeper =
        visible.find((q) => String(q.question_type || '').toLowerCase().includes('long')) ||
        visible.find((q) => /abandon|vehicle|property|empty|unauthor|issue|report/.test(blob(q))) ||
        visible[0]
      for (const q of sec.questions || []) {
        if (q === keeper) continue
        if (q.nv_hidden) continue
        q.nv_hidden = true
      }
      continue
    }

    if (isSignOffSectionTitle(sec.title || sec.name)) {
      const keeper =
        visible.find((q) =>
          /sign|confirm|visit date|resident|display name/i.test(`${q.question_text || ''} ${q.resident_wording || ''}`)
        ) ||
        visible[visible.length - 1] ||
        visible[0]
      for (const q of sec.questions || []) {
        if (q === keeper) continue
        if (q.nv_hidden) continue
        q.nv_hidden = true
      }
    }
  }
}

function appendEstateFeedbackToWindowsSection(template) {
  const sections = template.sections || []
  const winIdx = sections.findIndex((s) => /window|windows/i.test(s.title || s.name || ''))
  if (winIdx < 0) return
  const win = sections[winIdx]
  const questions = win.questions || (win.questions = [])
  if (questions.some((q) => q.id === 'nv-q-estate-feedback')) return
  questions.push({
    id: 'nv-q-estate-feedback',
    question_text: 'Estate Feedback (Resident Insight)',
    resident_wording: 'Estate Feedback (Resident Insight)',
    question_type: 'long_text',
    is_required: false,
    nv_synthetic: true,
  })
}

/**
 * @param {import('@/lib/airtable-client').TemplateNested} template
 */
export function applyNeighbourhoodVoiceTemplatePatch(template) {
  if (!template || !isNeighbourhoodVoiceTemplateLocal(template)) return template

  for (const sec of template.sections || []) {
    for (const q of sec.questions || []) {
      if (shouldHideAsMisplacedEstateRow(q, sec.title || sec.name)) {
        q.nv_hidden = true
      }
      if (shouldHideMisplacedSignoffRow(q, sec.title || sec.name)) {
        q.nv_hidden = true
      }
    }
  }

  appendEstateFeedbackToWindowsSection(template)

  hideDuplicateTailSectionQuestions(template)

  let order = 0
  /** @type {{ q: object, key: string }[]} */
  const all = []

  for (const sec of template.sections || []) {
    for (const q of sec.questions || []) {
      if (q.nv_hidden) {
        q._nv_key = null
        continue
      }
      if (q.nv_synthetic && q.id === 'nv-q-estate-feedback') {
        Object.assign(q, { _nv_key: 'EF' })
        all.push({ q, key: 'EF' })
        continue
      }
      order += 1
      const key = nvKeyForQuestion(q, order)
      Object.assign(q, { _nv_key: key })
      all.push({ q, key })
    }
  }

  const byKey = {}
  for (const { q, key } of all) {
    byKey[key] = q
  }

  const q8 = byKey.Q8
  const gradingFromQ8 = q8
    ? {
        grading_scheme_id: q8.grading_scheme_id,
        grading_scheme_name: q8.grading_scheme_name,
        grading_options: q8.grading_options ? [...q8.grading_options] : ['A', 'B', 'C', 'D', 'NA'],
      }
    : {
        grading_scheme_id: null,
        grading_scheme_name: null,
        grading_options: ['A', 'B', 'C', 'D', 'NA'],
      }

  for (const { q, key } of all) {
    if (key === 'EF') {
      applyNvEstateFeedbackSynthetic(q)
      continue
    }

    const n = parseInt(String(key).replace(/^Q/i, ''), 10)
    if (n >= 1 && n <= 23) {
      applyNvStandard(q, gradingFromQ8, key)
      continue
    }
    if (key === 'Q24') {
      applyNvIssuesReport(q)
      continue
    }
    if (key === 'Q25') {
      applyNvSignoff(q)
      continue
    }
  }

  for (const sec of template.sections || []) {
    const title = (sec.title ?? sec.name ?? '').toString().toLowerCase()
    if (!title.includes('issue')) continue
    for (const q of sec.questions || []) {
      if (q.nv_hidden) continue
      if (['nv_standard', 'nv_estate_feedback', 'nv_issues_report', 'nv_q25'].includes(q.nv_render_kind)) continue
      const raw = String(q.question_type || '').toLowerCase()
      const isYesNo =
        q.nv_render_kind === 'yes_no' || raw.includes('yes_no') || (raw.includes('yes') && raw.includes('no'))
      if (!isYesNo) continue
      if (q.photo_required_when === 'on_no') q.photo_required_when = 'on_yes'
      if (q.comment_required_when === 'on_no') q.comment_required_when = 'on_yes'
    }
  }

  return template
}

export function applyNeighbourhoodVoicePatchesToList(templates) {
  if (!Array.isArray(templates)) return templates
  for (const t of templates) {
    applyNeighbourhoodVoiceTemplatePatch(t)
  }
  return templates
}
