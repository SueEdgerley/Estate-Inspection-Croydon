/**
 * In-memory patches for the Neighbourhood Voice template only.
 * Does not change Airtable; runs after getTemplatesNested() builds each template.
 *
 * Question keys: uses Airtable "Question Key" when it matches Q1–Q25; otherwise
 * falls back to global order (section order + question order).
 */

function isNeighbourhoodVoiceTemplateLocal(template) {
  if (!template) return false
  const key = (template.template_key ?? template['Template Key'] ?? '').toString().toLowerCase().trim()
  const name = (template.name ?? '').toString().toLowerCase().trim()
  if (key === 'nv' || key === 'neighbourhood_voice' || key === 'neighbourhood voice') return true
  if (name.includes('neighbourhood voice') || name.includes('neighbourhood voices')) return true
  return false
}

/** Wording aligned to Template Questions rows 188–192 — update if Airtable differs. */
export const NV_Q24_INSTRUCTION_ROWS = [
  'Are there places on the estate where you feel unsafe or unwelcome? (e.g. poor lighting, blind corners, ASB hotspots)',
  'Is there anything about the design or upkeep of the estate that makes daily life harder? (e.g. access, bins, trip hazards)',
  'How easy is it to find out who to contact if something needs fixing or you need help?',
  'What one change would make the biggest difference to how you feel about where you live?',
  'Is there anything else you want us to know about your estate or block?',
]

const COMMENT_ALWAYS_KEYS = new Set([
  'Q1',
  'Q3',
  'Q6',
  'Q7',
  'Q9',
  'Q11',
  'Q12',
  'Q13',
  'Q21',
])

const GRADING_LIKE_Q8_KEYS = new Set(['Q2', 'Q4', 'Q5', 'Q14', 'Q15', 'Q16', 'Q17', 'Q18'])

const GRADED_COMMENT_PHOTO_KEYS = new Set(['Q2', 'Q16', 'Q17'])

function nvKeyForQuestion(q, orderIndex) {
  const k = q.question_key != null ? String(q.question_key).trim() : ''
  if (/^Q\d+$/i.test(k)) return k.toUpperCase()
  return `Q${orderIndex}`
}

function deepCloneQuestion(q) {
  return JSON.parse(JSON.stringify(q))
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
    // --- Grading like Q8 ---
    if (GRADING_LIKE_Q8_KEYS.has(key)) {
      q.question_type = 'graded'
      q.question_type_raw = 'graded'
      q.grading_scheme_id = gradingFromQ8.grading_scheme_id
      q.grading_scheme_name = gradingFromQ8.grading_scheme_name
      q.grading_options = [...(gradingFromQ8.grading_options || ['A', 'B', 'C', 'D', 'NA'])]
      Object.assign(q, {
        nv_graded_require_comment_photo: GRADED_COMMENT_PHOTO_KEYS.has(key),
      })
    }

    // --- Always show comment (yes/no or graded) ---
    if (COMMENT_ALWAYS_KEYS.has(key)) {
      q.comment_required_when = 'always'
    }

    // --- Flip NV default: photo/comment when Yes, not only when No ---
    const kind =
      q.question_type === 'graded' || String(q.question_type || '').includes('grad')
        ? 'graded'
        : 'yes_no'
    if (kind === 'yes_no') {
      if (q.photo_required_when === 'on_no') q.photo_required_when = 'on_yes'
      if (q.comment_required_when === 'on_no' && !COMMENT_ALWAYS_KEYS.has(key)) {
        q.comment_required_when = 'on_yes'
      }
    }

    // --- Q24: geo + five instruction rows (rows 188–192) ---
    if (key === 'Q24') {
      q.nv_q24 = true
      q.nv_q24_instruction_rows = [...NV_Q24_INSTRUCTION_ROWS]
      q.enable_geolocation = true
      q.helper_text = [
        'Please read each point below, then share your location if you are comfortable doing so.',
        ...NV_Q24_INSTRUCTION_ROWS.map((line, i) => `${i + 1}. ${line}`),
      ].join('\n\n')
    }

    // --- Q25: visit date + resident name ---
    if (key === 'Q25') {
      q.nv_q25 = true
      q.helper_text = [
        q.helper_text || '',
        'Provide the date of this visit and how you would like your name to appear on the report (you can edit the suggested name).',
      ]
        .filter(Boolean)
        .join('\n\n')
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
