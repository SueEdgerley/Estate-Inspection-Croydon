import { getNvGradedMeta } from './neighbourhood-voice-question-schema.js'

/**
 * In-memory patches for the Neighbourhood Voice template only.
 *
 * - Q1–Q23: `nv_standard` — A/B/C/D/NA sourced from Airtable rows.
 * - Q24: `nv_issues_report` — **Issues to report only** (copy/order from Airtable Template Questions rows 188–192);
 *   photo and location UI only when Yes; stored on `q.nv_q24_airtable_rows`.
 * - Q25: `nv_q25` — **Sign off only** (explicit titles; helper text cleared so nothing bleeds from Q24).
 *
 * Misplaced estate / sign-off / duplicate Issues rows are marked `nv_hidden`.
 * Ghost rows (empty titles, standalone "Comments", instruction-only, duplicate prompts, `*_comment` ids) are hidden.
 * Other templates unchanged.
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

/** Primary line shown to residents (Airtable may split across fields). */
export function nvPrimaryDisplayText(q) {
  if (!q) return ''
  const a = String(q.resident_wording ?? '').trim()
  const b = String(q.question_text ?? '').trim()
  const c = String(q.label ?? '').trim()
  return a || b || c
}

function normalizeNvTitleKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
}

function humanizeIssueTypeSlug(slug) {
  if (!slug) return ''
  return String(slug)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim()
}

/**
 * Airtable often adds orphan "Comments" / grading-only / instruction rows. Hide them for NV.
 * Does not hide synthetic questions or rows already nv_hidden.
 */
function shouldHideNvGhostRow(q) {
  if (!q || q.nv_synthetic) return false
  const t = nvPrimaryDisplayText(q)
  const h = String(q.helper_text ?? '').trim()
  const id = String(q.id ?? '')

  if (/_comment$/i.test(id) || /_comments$/i.test(id)) return true
  if (/_photo$/i.test(id) && (!t || t.length < 3)) return true

  if (!t || t.length < 2) {
    if (h.length >= 40) return true
    return true
  }

  const trimmed = t.trim()
  const lower = trimmed.toLowerCase()

  if (/^(comments?|comment|add a comment|your comment|additional comments?|further comments?)$/i.test(trimmed)) {
    return true
  }
  if (/^(photo|photos|add photo|images?|attachments?)$/i.test(trimmed)) return true
  if (/^(grade|grading|rating|scores?)$/i.test(trimmed)) return true
  if (trimmed.length < 12 && /^(optional|notes|n\/a|required)$/i.test(lower)) return true

  if (/\b(for guidance|instruction|please read|read before|note:)\b/i.test(trimmed) && trimmed.length < 160) {
    return true
  }

  const raw = String(q.question_type ?? q.question_type_raw ?? q.answer_mode ?? '').toLowerCase()
  if (/^comment(_only)?$/i.test(raw) && !raw.includes('graded')) return true
  if (raw === 'section_header' || raw === 'divider' || raw === 'info' || raw === 'static' || raw === 'label') {
    return true
  }

  const looksGraded = raw.includes('grad') || (Array.isArray(q.grading_options) && q.grading_options.length > 0)
  if (looksGraded && trimmed.length < 3) return true

  return false
}

/**
 * Wizard / forms: skip ghost rows even if a snapshot missed the patch pass.
 */
export function isNeighbourhoodVoiceQuestionRenderable(q) {
  if (!q || q.nv_hidden) return false
  if (q.nv_synthetic) return true
  const kind = q.nv_render_kind
  const isNvPatched =
    kind === 'nv_standard' ||
    kind === 'nv_estate_feedback' ||
    kind === 'nv_issues_report' ||
    kind === 'nv_plain_textarea' ||
    kind === 'nv_q25' ||
    kind === 'nv_q24'
  if (!isNvPatched) return true
  return !shouldHideNvGhostRow(q)
}

/**
 * Short label from patched `_nv_key` for UI (e.g. "Q7", "Q24").
 * Returns null for extras / unnumbered rows.
 */
export function getNvQuestionStepLabel(q) {
  if (!q || q.nv_hidden) return null
  const k = q._nv_key
  if (k == null || k === '') return null
  const s = String(k).trim()
  if (/^EXTRA_/i.test(s)) return null
  const m = /^Q(\d+)$/i.exec(s)
  if (m) return `Q${m[1]}`
  return null
}

function ensureNvGradedDisplayTitleFromSchema(q, nvKey) {
  const cur = nvPrimaryDisplayText(q)
  if (cur && cur.length >= 3) return
  const meta = getNvGradedMeta(nvKey)
  const slug = meta?.issue_type || meta?.issue_category
  const label = humanizeIssueTypeSlug(slug)
  if (label) {
    if (!String(q.resident_wording ?? '').trim()) q.resident_wording = label
    if (!String(q.question_text ?? '').trim()) q.question_text = label
  }
}

/** Within a section, hide duplicate prompt text (common Airtable duplication). Tail sections use their own dedupe. */
function hideDuplicateNvQuestionPromptsInSection(template) {
  for (const sec of template.sections || []) {
    if (isEstateFeedbackSection(sec) || isIssuesToReportSection(sec) || isSignOffSectionTitle(sec.title || sec.name)) {
      continue
    }
    const seen = new Set()
    for (const q of sec.questions || []) {
      if (q.nv_hidden) continue
      const key = normalizeNvTitleKey(nvPrimaryDisplayText(q))
      if (!key || key.length < 4) continue
      if (seen.has(key)) {
        q.nv_hidden = true
        q._nv_key = null
      } else {
        seen.add(key)
      }
    }
  }
}

function isNeighbourhoodVoiceTemplateLocal(template) {
  if (!template) return false
  const key = (template.template_key ?? template['Template Key'] ?? '').toString().toLowerCase().trim()
  const name = (template.name ?? '').toString().toLowerCase().trim()
  if (key === 'nv' || key === 'neighbourhood_voice' || key === 'neighbourhood voice') return true
  if (name.includes('neighbourhood voice') || name.includes('neighbourhood voices')) return true
  return false
}

const NV_ESTATE_FEEDBACK_PROMPTS = [
  'Are there places on the estate where you feel unsafe or unwelcome?',
  'Is there anything about the design or upkeep of the estate that makes daily life harder?',
  'How easy is it to find out who to contact if something needs fixing or you need help?',
  'What one change would make the biggest difference to how you feel about where you live?',
  'Is there anything else you want us to know about your estate or block?',
]

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
  q._nv_section_key = meta.section_key
  q._nv_issue_category = meta.issue_category
  q._nv_issue_type = meta.issue_type
  q._nv_suggested_team_role = meta.suggested_team_role
  q._nv_create_issue_on_c = !!meta.create_issue_on_c
  q._nv_default_priority_d = meta.default_priority_d || 'medium'
  q._nv_default_priority_c = meta.default_priority_c || 'low'
}

/**
 * Maps displayed step Q1..Q23 to canonical schema keys Q1..Q23.
 * @param {number} displayNum 1-based step index shown to residents
 * @returns {string}
 */
function nvGradedSchemaKeyForDisplaySlot(displayNum) {
  const n = Number(displayNum)
  if (!Number.isFinite(n) || n < 1) return 'Q1'
  if (n <= 23) return `Q${n}`
  return 'Q23'
}

function applyNvStandard(q, gradingFromQ8, schemaKeyForMeta, displayStepKey) {
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
  if (schemaKeyForMeta) applyNvIssueMetaFromSchema(q, schemaKeyForMeta)
  if (displayStepKey != null && displayStepKey !== '') {
    q._nv_key = displayStepKey
  } else if (schemaKeyForMeta) {
    q._nv_key = schemaKeyForMeta
  }
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
  q.question_text = 'Sign off'
  q.resident_wording = 'Sign off'
  q.helper_text = ''
}

/** Synthetic NV-only: one large textarea, no grade / no photo / no separate comment field. */
function applyNvPlainTextareaSynthetic(q) {
  q.nv_render_kind = 'nv_plain_textarea'
  q.question_type = 'long_text'
  q.question_type_raw = 'long_text'
  stripGradingMetadata(q)
  stripOptionsForTextAnswer(q)
  q.photo_required_when = undefined
  q.type_includes_photo = false
  q.comment_required_when = undefined
  q.nv_issues_report = false
  q.nv_q25 = false
}

function createNvPreSignoffTextareaQuestions(fallbackSectionId) {
  const mk = (id, text) => {
    const q = {
      id,
      question_text: text,
      resident_wording: text,
      label: text,
      is_required: false,
      nv_synthetic: true,
      nv_hidden: false,
      helper_text: '',
      _nv_answer_section_id: fallbackSectionId,
    }
    applyNvPlainTextareaSynthetic(q)
    return q
  }
  return [
    mk(
      'nv-q-minor-estate-improvements',
      'Please include any suggestions for minor estate improvements (eg fencing, gates, signs, lighting and landscaping, etc) and where you would like to see your proposed scheme:'
    ),
    mk(
      'nv-q-housing-services-comments',
      'If you have any other comments regarding housing services in your block/area please include them here:'
    ),
  ]
}

const NV_EXACT_SECTIONS = [
  {
    title: '1. Caretaking Duties - Bin Chamber',
    grade: 'Please can you grade the condition of the Bin Chamber',
  },
  {
    title: '2. Caretaking Duties - Entrance',
    grade: 'Please can you grade the condition of the Entrance to the Block',
  },
  {
    title: '3. Caretaking Duties - Lifts (Where Applicable)',
    grade: 'Please can you grade the condition of the Lifts',
  },
  {
    title: '4. Caretaking Duties - Stairs',
    grade: 'Please can you grade the condition of the stairs',
  },
  {
    title: '5. Caretaking Duties - Landings/Balconies',
    grade: 'Please can you grade the condition of the landings/balconies',
  },
  {
    title: '6. Caretaking Duties - Walls (Paintings)',
    grade: 'Please can you grade the condition of the walls (Painted)',
  },
  {
    title: '7. Caretaking Duties - Lights',
    grade: 'Please can you grade the condition of the lights',
  },
  {
    title: '8.Caretaking Duties - Handrails',
    grade: 'Please can you grade the condition of the handrails',
  },
  {
    title: '9. Caretaking Duties - Window Frames/Panels',
    grade: 'Please can you grade the condition of the Window Frames / Panels',
  },
  {
    title: '10. Estate Cleansing - Grassed Areas',
    grade: 'Please can you grade the condition of the Grassed Areas',
  },
  {
    title: '11. Estate Cleansing - Hard Standing',
    grade: 'Please can you grade the condition of the Hard Standing (drying areas)',
  },
  {
    title: '12. Estate Cleansing - Garage Areas',
    grade: 'Please can you grade the condition of the garage areas',
  },
  {
    title: '13. Estate Cleansing - Pathways',
    grade: 'Please can you grade the condition of the pathways',
  },
  {
    title: '14. Estate Cleansing - Roads',
    grade: 'Please can you grade the condition of the Roads',
  },
  {
    title: '15. Estate Cleansing - Recycling Facilities',
    grade: 'Please can you grade the condition of the Recycling Facilities',
  },
  {
    title: '16. Estate Cleansing - Car Parks',
    grade: 'Please can you grade the condition of the Car Parks',
  },
  {
    title: '17. Estate Cleansing - Play Areas',
    grade: 'Please can you grade the condition of the Play Areas',
  },
  {
    title: '18. Horticultural Services - Grass Cutting',
    grade: 'Please can you grade the condition of the Grass Cutting',
  },
  {
    title: '19. Horticultural Services - Shrubs/Flower Beds',
    grade: 'Please can you grade the condition of the Shrubs/Flower Beds',
  },
  {
    title: '20. Horticultural Services - Hedges',
    grade: 'Please can you grade the condition of the Hedges',
  },
  {
    title: '21. Horticultural Services - Weed Killing',
    grade: 'Please can you grade the condition of the Weed Killing',
  },
  {
    title: '22. Window Cleaning (communal) - Windows',
    grade: 'Please can you grade the condition of the Windows',
  },
  {
    title: '23. Window Cleaning (communal) Doors/Panels',
    grade: 'Please can you grade the condition of the Doors/Panels',
  },
  {
    title: '24. Issues to report',
    questions: [
      'Are there any issues around Fire Safety (i.e. defective fire doors, window openers, dry risers, obstructions in communal areas, incorrect/defaced/missing signage) that you would like to highlight - Please provide details and the location',
      'Are there Empty or Abandoned properties or unauthorised occupants that are causing an Issue - Please provide details and the location',
      'Are there any Abandoned Vehicles that are causing an Issue - Please provide details and the location',
      'Are there any Anti-social Behaviour issues that you would like to report (e.g. smoking/drug-taking in blocks, urinating in lifts, dog fouling in grounds, flytipping/dumped rubbish, graffiti)',
      'Are there any minor estate improvements (eg fencing, gates, signs, lighting and landscaping, etc) and where you would like to see your proposed scheme:',
      'If you have any other comments regarding housing services in your block/area please include them here',
      'Comments',
    ],
  },
  {
    title: '25. Sign Off',
    questions: [
      'Sign Off',
    ],
  },
]

function nvExactId(sectionNumber, questionNumber) {
  return `nv_exact_s${sectionNumber}_q${questionNumber}`
}

function buildNvExactQuestion(sectionNumber, text, questionNumber, kind = 'long_text') {
  const id = nvExactId(sectionNumber, questionNumber)
  const base = {
    id,
    question_key: id,
    question_text: text,
    resident_wording: text,
    label: text,
    is_required: false,
    nv_hidden: false,
    _nv_key: sectionNumber === 24 ? 'Q24' : sectionNumber === 25 ? 'Q25' : `Q${sectionNumber}`,
  }

  if (kind === 'graded') {
    return {
      ...base,
      question_type: 'graded',
      question_type_raw: 'graded',
      grading_options: ['A', 'B', 'C', 'D', 'NA'],
      grading_scheme_name: 'A-D/NA',
    }
  }

  if (kind === 'sign_off') {
    return {
      ...base,
      question_type: 'text',
      question_type_raw: 'text',
      is_required: true,
      nv_q25: true,
      nv_render_kind: 'nv_q25',
      nv_q25_signoff_only: true,
      helper_text: '',
      options: [],
      include_photo: false,
      type_includes_photo: false,
      photo_required_when: undefined,
      comment_required_when: undefined,
    }
  }

  return {
    ...base,
    question_type: 'long_text',
    question_type_raw: 'long_text',
  }
}

function applyExactNeighbourhoodVoiceTemplate(template) {
  template.sections = NV_EXACT_SECTIONS.map((section, index) => {
    const sectionNumber = index + 1
    const questions =
      sectionNumber === 25
        ? [buildNvExactQuestion(sectionNumber, 'Sign Off', 1, 'sign_off')]
        : section.grade
          ? [
              buildNvExactQuestion(sectionNumber, section.grade, 1, 'graded'),
              buildNvExactQuestion(sectionNumber, 'Comments', 2),
            ]
          : section.questions.map((question, questionIndex) =>
              buildNvExactQuestion(sectionNumber, question, questionIndex + 1, 'long_text')
            )

    return {
      id: `nv-exact-section-${sectionNumber}`,
      title: section.title,
      name: section.title,
      sort_order: sectionNumber,
      help_text: '',
      what_to_look_for: '',
      questions,
      nv_exact_section: true,
    }
  })
  template.questions = template.sections.flatMap((section) => section.questions || [])
  return template
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

/** Sign-off prompts must not appear under Window Cleaning / last graded block. */
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

/** Q24 / “Issues to report” copy must not appear under Window Cleaning or other graded sections. */
function shouldHideMisplacedIssuesToReportRow(q, sectionTitle) {
  if (isIssuesToReportSection({ title: sectionTitle, name: sectionTitle })) return false
  const blob = `${q.resident_wording || ''} ${q.question_text || ''} ${q.helper_text || ''}`.toLowerCase()
  if (blob.includes('issues to report')) return true
  return NV_Q24_AIRTABLE_ROWS_188_192.some((row) => {
    const n = row.slice(0, 48).toLowerCase()
    return n.length > 18 && blob.includes(n)
  })
}

function isIssuesToReportSection(sec) {
  const t = `${sec.title || ''} ${sec.name || ''}`.toLowerCase()
  if (t.includes('issues to report')) return true
  if (t.includes('issue') && t.includes('report')) return true
  return false
}

/** Dedicated estate / resident insight block (not generic “estate” inspection wording). */
function isEstateFeedbackSection(sec) {
  const t = `${sec.title || ''} ${sec.name || ''}`.toLowerCase()
  if (t.includes('resident insight')) return true
  if (t.includes('estate feedback')) return true
  if (t.includes('estate') && t.includes('feedback')) return true
  return false
}

/**
 * Leave a single primary row per NV tail section (issues, sign-off) so Q24 / Q25 do not bleed into extra wizard steps.
 * Estate feedback / resident insight Airtable sections are fully hidden (not shown on the form).
 */
function hideDuplicateTailSectionQuestions(template) {
  for (const sec of template.sections || []) {
    const visible = (sec.questions || []).filter((q) => !q.nv_hidden)
    if (visible.length <= 1) continue

    if (isEstateFeedbackSection(sec)) {
      for (const q of sec.questions || []) {
        if (q.nv_hidden) continue
        q.nv_hidden = true
        q._nv_key = null
      }
      continue
    }

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

/** Stable section_id for answers API when a row is shown in a synthetic NV section. */
function pickNvFallbackAnswerSectionId(template) {
  const sections = template.sections || []
  const win = sections.find((s) => /window|windows/i.test(s.title || s.name || ''))
  if (win?.id) return win.id
  const first = sections.find((s) => (s.questions || []).length)
  return first?.id || 'nv-fallback-section'
}

/**
 * Replace Airtable section tree with a fixed wizard/PDF order: Q1–Q21 → Issues → (two plain textareas) → Sign-off.
 * Question objects are reused (same ids for answers); `_nv_answer_section_id` preserves POST section_id.
 */
function restructureNeighbourhoodVoiceSections(template, all, byKey) {
  const originByQid = new Map()
  for (const sec of template.sections || []) {
    for (const q of sec.questions || []) {
      originByQid.set(q.id, sec.id)
    }
  }
  const fallbackSaveSec = pickNvFallbackAnswerSectionId(template)

  const markSave = (q) => {
    if (!q || q._nv_answer_section_id) return
    q._nv_answer_section_id = originByQid.get(q.id) || fallbackSaveSec
  }

  const graded = []
  for (let i = 1; i <= 21; i++) {
    const k = `Q${i}`
    const gq = byKey[k]
    if (!gq || gq.nv_hidden) continue
    markSave(gq)
    graded.push(gq)
  }

  const q24 = byKey.Q24
  const q25 = byKey.Q25
  if (q24) markSave(q24)
  if (q25) markSave(q25)

  const preSignoffQs = createNvPreSignoffTextareaQuestions(fallbackSaveSec)
  for (const q of preSignoffQs) {
    markSave(q)
  }

  const used = new Set(
    [...graded.map((q) => q.id), q24?.id, ...preSignoffQs.map((q) => q.id), q25?.id].filter(Boolean)
  )
  const orphans = []
  for (const { q } of all) {
    if (used.has(q.id)) continue
    if (q.nv_hidden) continue
    if (shouldHideNvGhostRow(q)) {
      q.nv_hidden = true
      continue
    }
    markSave(q)
    orphans.push(q)
  }

  const out = []
  if (graded.length) {
    out.push({
      id: 'nv-sec-inspection',
      title: 'Inspection',
      name: 'Inspection',
      help_text: '',
      what_to_look_for: '',
      questions: graded,
      nv_synthetic_section: true,
    })
  }
  if (q24) {
    out.push({
      id: 'nv-sec-issues',
      title: 'Issues to report',
      name: 'Issues to report',
      help_text: '',
      what_to_look_for: '',
      questions: [q24],
      nv_synthetic_section: true,
    })
  }
  out.push({
    id: 'nv-sec-pre-signoff',
    title: 'Further comments',
    name: 'Further comments',
    help_text: '',
    what_to_look_for: '',
    questions: preSignoffQs,
    nv_synthetic_section: true,
  })
  if (q25) {
    out.push({
      id: 'nv-sec-signoff',
      title: 'Sign-off',
      name: 'Sign-off',
      help_text: '',
      what_to_look_for: '',
      questions: [q25],
      nv_synthetic_section: true,
    })
  }
  if (orphans.length) {
    out.push({
      id: 'nv-sec-remaining',
      title: 'Additional',
      name: 'Additional',
      help_text: '',
      questions: orphans,
      nv_synthetic_section: true,
    })
  }

  template.sections = out
}

/**
 * @param {import('@/lib/airtable-client').TemplateNested} template
 */
export function applyNeighbourhoodVoiceTemplatePatch(template) {
  if (!template || !isNeighbourhoodVoiceTemplateLocal(template)) return template
  return applyExactNeighbourhoodVoiceTemplate(template)

  for (const sec of template.sections || []) {
    for (const q of sec.questions || []) {
      if (shouldHideAsMisplacedEstateRow(q, sec.title || sec.name)) {
        q.nv_hidden = true
      }
      if (shouldHideMisplacedSignoffRow(q, sec.title || sec.name)) {
        q.nv_hidden = true
      }
      if (shouldHideMisplacedIssuesToReportRow(q, sec.title || sec.name)) {
        q.nv_hidden = true
      }
    }
  }

  hideDuplicateTailSectionQuestions(template)

  /** @type {{ q: object, key: string }[]} */
  const all = []
  const have = { Q24: false, Q25: false }
  let gradedIndex = 0
  /** @type {object[]} */
  const gradedSequential = []

  for (const sec of template.sections || []) {
    for (const q of sec.questions || []) {
      if (q.nv_hidden) {
        q._nv_key = null
        continue
      }
      if (isIssuesToReportSection(sec)) {
        if (have.Q24) {
          q.nv_hidden = true
          q._nv_key = null
          continue
        }
        have.Q24 = true
        Object.assign(q, { _nv_key: 'Q24' })
        all.push({ q, key: 'Q24' })
        continue
      }
      if (isSignOffSectionTitle(sec.title || sec.name)) {
        if (have.Q25) {
          q.nv_hidden = true
          q._nv_key = null
          continue
        }
        have.Q25 = true
        Object.assign(q, { _nv_key: 'Q25' })
        all.push({ q, key: 'Q25' })
        continue
      }
      if (isEstateFeedbackSection(sec) || q.id === 'nv-q-estate-feedback' || q.nv_estate_feedback) {
        q.nv_hidden = true
        q._nv_key = null
        continue
      }
      gradedIndex += 1
      if (gradedIndex <= 23) {
        gradedSequential.push(q)
      } else {
        const key = `EXTRA_${gradedIndex}`
        Object.assign(q, { _nv_key: key })
        all.push({ q, key })
      }
    }
  }

  const first23 = gradedSequential.slice(0, 23)
  let keptGraded = first23.slice()
  if (first23.length >= 16) {
    for (const rq of first23.slice(14, 16)) {
      rq.nv_hidden = true
      rq._nv_key = null
    }
    keptGraded = [...first23.slice(0, 14), ...first23.slice(16)]
  }
  keptGraded = keptGraded.slice(0, 21)
  for (let i = 0; i < keptGraded.length; i++) {
    const q = keptGraded[i]
    const displayNum = i + 1
    const key = `Q${displayNum}`
    Object.assign(q, { _nv_key: key })
    all.push({ q, key })
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
    if (key === 'Q24') {
      applyNvIssuesReport(q)
      continue
    }
    if (key === 'Q25') {
      applyNvSignoff(q)
      continue
    }
    const n = parseInt(String(key).replace(/^Q/i, ''), 10)
    if (Number.isFinite(n) && n >= 1 && n <= 21) {
      applyNvStandard(q, gradingFromQ8, nvGradedSchemaKeyForDisplaySlot(n), `Q${n}`)
    }
  }

  for (let i = 1; i <= 21; i++) {
    const q = byKey[`Q${i}`]
    if (!q || q.nv_hidden) continue
    ensureNvGradedDisplayTitleFromSchema(q, nvGradedSchemaKeyForDisplaySlot(i))
    if (shouldHideNvGhostRow(q)) {
      q.nv_hidden = true
      q._nv_key = null
    }
  }

  restructureNeighbourhoodVoiceSections(template, all, byKey)

  for (const sec of template.sections || []) {
    const title = (sec.title ?? sec.name ?? '').toString().toLowerCase()
    if (!title.includes('issue')) continue
    for (const q of sec.questions || []) {
      if (q.nv_hidden) continue
      if (
        ['nv_standard', 'nv_estate_feedback', 'nv_issues_report', 'nv_plain_textarea', 'nv_q25'].includes(
          q.nv_render_kind
        )
      )
        continue
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
