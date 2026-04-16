/**
 * In-memory patches for the Neighbourhood Voice template only.
 * Does not change Airtable; runs after getTemplatesNested() builds each template.
 *
 * Question keys Q1…Qn = **global order** (all sections, top to bottom). Airtable
 * "Question Key" and raw types are often wrong; we drive behaviour from this file.
 *
 * `nv_render_kind` is read first by getEffectiveQuestionKind() so the live UI
 * matches the spec below — not generic graded/long_text heuristics.
 */

function isNeighbourhoodVoiceTemplateLocal(template) {
  if (!template) return false
  const key = (template.template_key ?? template['Template Key'] ?? '').toString().toLowerCase().trim()
  const name = (template.name ?? '').toString().toLowerCase().trim()
  if (key === 'nv' || key === 'neighbourhood_voice' || key === 'neighbourhood voice') return true
  if (name.includes('neighbourhood voice') || name.includes('neighbourhood voices')) return true
  return false
}

/**
 * Sync wording with Airtable Template Questions rows 188–192 (exact order + text).
 * Geo copy below supports abandoned-vehicle / location reporting on Q24.
 */
export const NV_Q24_INSTRUCTION_ROWS = [
  'Are there places on the estate where you feel unsafe or unwelcome? (e.g. poor lighting, blind corners, ASB hotspots)',
  'Is there anything about the design or upkeep of the estate that makes daily life harder? (e.g. access, bins, trip hazards)',
  'How easy is it to find out who to contact if something needs fixing or you need help?',
  'What one change would make the biggest difference to how you feel about where you live?',
  'Is there anything else you want us to know about your estate or block?',
]

export const NV_Q24_GEO_HELPER =
  'If you are reporting abandoned vehicles or need a location pin, use the button below to share your approximate position (optional).'

/**
 * Per-question NV behaviour. Keys not listed rely on Airtable (user said Q10, Q19, Q20, Q22, Q23 are OK).
 *
 * gradedFollowUp:
 * - 'comment' → grade + comment
 * - 'comment_photo' → grade + comment + photo
 * - 'none' → grade only (reference Q8; same for Q14, Q15, Q18)
 *
 * render:
 * - 'graded' | 'long_text' | 'nv_q24' | 'nv_q25'
 */
const NV_QUESTION_SPECS = {
  Q1: { render: 'graded', gradedFollowUp: 'comment' },
  Q2: { render: 'graded', gradedFollowUp: 'comment_photo' },
  Q3: { render: 'graded', gradedFollowUp: 'comment_photo' },
  Q4: { render: 'graded', gradedFollowUp: 'comment' },
  Q5: { render: 'graded', gradedFollowUp: 'comment' },
  Q6: { render: 'long_text' },
  Q7: { render: 'long_text' },
  Q8: { render: 'graded', gradedFollowUp: 'none' },
  Q9: { render: 'long_text' },
  Q11: { render: 'long_text' },
  Q12: { render: 'long_text' },
  Q13: { render: 'long_text' },
  Q14: { render: 'graded', gradedFollowUp: 'none' },
  Q15: { render: 'graded', gradedFollowUp: 'none' },
  Q16: { render: 'graded', gradedFollowUp: 'comment_photo' },
  Q17: { render: 'graded', gradedFollowUp: 'comment_photo' },
  Q18: { render: 'graded', gradedFollowUp: 'none' },
  Q21: { render: 'long_text' },
  Q24: { render: 'nv_q24' },
  Q25: { render: 'nv_q25' },
}

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

function applyGradedFromQ8(q, gradingFromQ8, followUp) {
  q.question_type = 'graded'
  q.question_type_raw = 'graded'
  q.grading_scheme_id = gradingFromQ8.grading_scheme_id
  q.grading_scheme_name = gradingFromQ8.grading_scheme_name
  q.grading_options = [...(gradingFromQ8.grading_options || ['A', 'B', 'C', 'D', 'NA'])]
  q.nv_render_kind = 'graded'
  q.nv_graded_require_comment_photo = followUp === 'comment_photo'
  q.nv_graded_require_comment_only = followUp === 'comment'
  if (followUp === 'none') {
    q.comment_required_when = undefined
  }
  if (followUp !== 'comment_photo') {
    q.photo_required_when = undefined
    q.type_includes_photo = false
  }
}

function applyLongText(q) {
  q.question_type = 'long_text'
  q.question_type_raw = 'long_text'
  stripGradingMetadata(q)
  stripOptionsForTextAnswer(q)
  q.photo_required_when = undefined
  q.type_includes_photo = false
  q.comment_required_when = undefined
  q.nv_render_kind = 'long_text'
  q.nv_graded_require_comment_photo = false
  q.nv_graded_require_comment_only = false
}

/**
 * @param {import('@/lib/airtable-client').TemplateNested} template
 */
export function applyNeighbourhoodVoiceTemplatePatch(template) {
  if (!template || !isNeighbourhoodVoiceTemplateLocal(template)) return template

  let order = 0
  /** @type {Record<string, object>} */
  const byKey = {}
  /** @type {{ q: object, key: string }[]} */
  const all = []

  for (const sec of template.sections || []) {
    const questions = sec.questions || []
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      order += 1
      const key = nvKeyForQuestion(q, order)
      Object.assign(q, { _nv_key: key })
      byKey[key] = q
      all.push({ q, key })
    }
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
    const spec = NV_QUESTION_SPECS[key]
    if (spec) {
      if (spec.render === 'long_text') {
        applyLongText(q)
        continue
      }
      if (spec.render === 'nv_q24') {
        q.nv_q24 = true
        q.nv_render_kind = 'nv_q24'
        q.question_type = 'long_text'
        q.question_type_raw = 'long_text'
        stripGradingMetadata(q)
        stripOptionsForTextAnswer(q)
        q.nv_q24_instruction_rows = [...NV_Q24_INSTRUCTION_ROWS]
        q.enable_geolocation = true
        q.helper_text = [
          'Please read each point below.',
          NV_Q24_GEO_HELPER,
          ...NV_Q24_INSTRUCTION_ROWS.map((line, i) => `${i + 1}. ${line}`),
        ].join('\n\n')
        continue
      }
      if (spec.render === 'nv_q25') {
        q.nv_q25 = true
        q.nv_render_kind = 'nv_q25'
        q.question_type = 'text'
        q.question_type_raw = 'text'
        stripGradingMetadata(q)
        stripOptionsForTextAnswer(q)
        q.photo_required_when = undefined
        q.type_includes_photo = false
        q.comment_required_when = undefined
        q.helper_text = [
          q.helper_text || '',
          'Sign off: enter the visit date and how your name should appear on the report. Optional: confirm the statement below.',
        ]
          .filter(Boolean)
          .join('\n\n')
        continue
      }
      if (spec.render === 'graded') {
        applyGradedFromQ8(q, gradingFromQ8, spec.gradedFollowUp || 'none')
        continue
      }
    }

    // --- Legacy fallbacks for Q10, Q19, Q20, Q22, Q23 (no spec): normalise yes/no photo on Yes ---
    const kind =
      q.question_type === 'graded' || String(q.question_type || '').includes('grad') ? 'graded' : 'yes_no'
    if (kind === 'yes_no') {
      if (q.photo_required_when === 'on_no') q.photo_required_when = 'on_yes'
      if (q.comment_required_when === 'on_no') q.comment_required_when = 'on_yes'
    }
  }

  // Issues to report (or similar): photo / follow-up when Yes, not only when No
  for (const sec of template.sections || []) {
    const title = (sec.title ?? sec.name ?? '').toString().toLowerCase()
    if (!title.includes('issue')) continue
    for (const q of sec.questions || []) {
      if (q.nv_render_kind === 'graded' || q.nv_render_kind === 'long_text' || q.nv_render_kind === 'nv_q24' || q.nv_render_kind === 'nv_q25') {
        continue
      }
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

/**
 * Apply patch to every template in the nested list (mutates NV template only).
 * @param {import('@/lib/airtable-client').TemplateNested[]} templates
 */
export function applyNeighbourhoodVoicePatchesToList(templates) {
  if (!Array.isArray(templates)) return templates
  for (const t of templates) {
    applyNeighbourhoodVoiceTemplatePatch(t)
  }
  return templates
}
