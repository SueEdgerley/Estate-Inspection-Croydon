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
  const isNvPatched = kind === 'nv_standard' || kind === 'nv_estate_feedback' || kind === 'nv_issues_report' || kind === 'nv_q25' || kind === 'nv_q24'
  if (!isNvPatched) return true
  return !shouldHideNvGhostRow(q)
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

export const NV_ESTATE_FEEDBACK_PROMPTS = [
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
 * Leave a single primary row per NV tail section so Q24 / Q25 do not bleed into extra wizard steps.
 */
function hideDuplicateTailSectionQuestions(template) {
  for (const sec of template.sections || []) {
    const visible = (sec.questions || []).filter((q) => !q.nv_hidden)
    if (visible.length <= 1) continue

    if (isEstateFeedbackSection(sec)) {
      const keeper =
        visible.find((q) => String(q.question_type || '').toLowerCase().includes('long')) || visible[0]
      for (const q of sec.questions || []) {
        if (q === keeper) continue
        if (q.nv_hidden) continue
        q.nv_hidden = true
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

function ensureSyntheticEstateFeedbackQuestion(template) {
  for (const sec of template.sections || []) {
    for (const q of sec.questions || []) {
      if (q.id === 'nv-q-estate-feedback') return q
    }
  }
  return {
    id: 'nv-q-estate-feedback',
    question_text: 'Estate Feedback (Resident Insight)',
    resident_wording: 'Estate Feedback (Resident Insight)',
    question_type: 'long_text',
    is_required: false,
    nv_synthetic: true,
  }
}

/**
 * Replace Airtable section tree with a fixed wizard/PDF order: Q1–Q23 → Estate Feedback → Issues → Sign-off.
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
  for (let i = 1; i <= 23; i++) {
    const k = `Q${i}`
    const gq = byKey[k]
    if (!gq || gq.nv_hidden) continue
    markSave(gq)
    graded.push(gq)
  }

  let ef = byKey.EF
  if (!ef) {
    ef = ensureSyntheticEstateFeedbackQuestion(template)
    Object.assign(ef, { _nv_key: 'EF' })
    byKey.EF = ef
  }
  markSave(ef)
  ef._nv_answer_section_id = ef._nv_answer_section_id || fallbackSaveSec

  const q24 = byKey.Q24
  const q25 = byKey.Q25
  if (q24) markSave(q24)
  if (q25) markSave(q25)

  const used = new Set([...graded.map((q) => q.id), ef?.id, q24?.id, q25?.id].filter(Boolean))
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
  out.push({
    id: 'nv-sec-estate-feedback',
    title: 'Estate Feedback (Resident Insight)',
    name: 'Estate Feedback (Resident Insight)',
    help_text: '',
    what_to_look_for: '',
    questions: [ef],
    nv_synthetic_section: true,
  })
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
  const have = { EF: false, Q24: false, Q25: false }
  let gradedIndex = 0

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
        if (have.EF) {
          q.nv_hidden = true
          q._nv_key = null
          continue
        }
        have.EF = true
        Object.assign(q, { _nv_key: 'EF' })
        all.push({ q, key: 'EF' })
        continue
      }
      if (q.nv_synthetic && q.id === 'nv-q-estate-feedback') {
        if (have.EF) {
          q.nv_hidden = true
          q._nv_key = null
          continue
        }
        have.EF = true
        Object.assign(q, { _nv_key: 'EF' })
        all.push({ q, key: 'EF' })
        continue
      }
      gradedIndex += 1
      if (gradedIndex <= 23) {
        const key = `Q${gradedIndex}`
        Object.assign(q, { _nv_key: key })
        all.push({ q, key })
      } else {
        const key = `EXTRA_${gradedIndex}`
        Object.assign(q, { _nv_key: key })
        all.push({ q, key })
      }
    }
  }

  if (!have.EF) {
    const efq = ensureSyntheticEstateFeedbackQuestion(template)
    Object.assign(efq, { _nv_key: 'EF' })
    all.push({ q: efq, key: 'EF' })
    have.EF = true
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
    if (key === 'Q24') {
      applyNvIssuesReport(q)
      continue
    }
    if (key === 'Q25') {
      applyNvSignoff(q)
      continue
    }
    const n = parseInt(String(key).replace(/^Q/i, ''), 10)
    if (Number.isFinite(n) && n >= 1 && n <= 23) {
      applyNvStandard(q, gradingFromQ8, `Q${n}`)
    }
  }

  for (let i = 1; i <= 23; i++) {
    const q = byKey[`Q${i}`]
    if (!q || q.nv_hidden) continue
    ensureNvGradedDisplayTitleFromSchema(q, `Q${i}`)
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
