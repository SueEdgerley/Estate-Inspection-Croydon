/**
 * Estate inspection form only: re-assign questions to the correct Template Section for display,
 * when Airtable links put many rows in one section but question/section copy reflects the true group.
 *
 * Strategy (no non-estate callers):
 * 1) Prefer the **longest** `section.title` / `section.name` substring contained in the question text blob
 *    (covers "1. Internal Cleaning - Cleaning completed for …" embedded in prompts).
 * 2) Short checklist labels (Entrance, Lobby, …) → Internal Cleaning when no title hit.
 * 3) Small keyword → `titleMustInclude` rules for blocks where (1) is weak.
 */

function sectionOrderNum(sec) {
  const n = Number(sec?.section_order ?? sec?.sort_order ?? sec?.order ?? 0)
  return Number.isFinite(n) ? n : 0
}

function questionBlob(q) {
  if (!q || typeof q !== 'object') return ''
  return `${q.question_text ?? ''} ${q.label ?? ''} ${q.resident_wording ?? ''} ${q.instructions ?? ''}`.toLowerCase()
}

/** @param {Record<string, unknown>} q */
function firstLineTopic(q) {
  const raw = String(q?.question_text ?? q?.label ?? '').trim().split(/\r?\n/)[0] || ''
  return raw.toLowerCase()
}

/**
 * Short row labels that belong under Internal Cleaning when the full section title is not in the prompt.
 * Informed by estate inspection checklist (Entrance, Lobby, …).
 */
const INTERNAL_CLEANING_TOPIC = /^(entrance|lobby|doors|glass|skirting boards|skirting|ledges and window sills|ledges|lights|lifts|handrails and spindles|handrails|cobwebs|landings|refuse chutes\/bin chambers|refuse chutes|bin chambers|other internal cleaning issue)/i

/**
 * `{ keywords: string[], titleMustInclude: string, titleMustNotInclude?: string[] }`
 * Keywords: any substring match in question blob (lowercase).
 */
const TOPIC_TITLE_RULES = [
  {
    keywords: ['graffiti removal'],
    titleMustInclude: 'graffiti removal',
  },
  {
    keywords: ['grass cutting', 'dog fouling', 'fly tipping', 'potholes', 'external cleaning', 'graffiti'],
    titleMustInclude: 'external cleaning',
    titleMustNotInclude: ['litter removal', 'graffiti removal'],
  },
  {
    keywords: ['is there any asb', 'asb to report'],
    titleMustInclude: 'asb',
  },
  {
    keywords: ['health and safety issues'],
    titleMustInclude: 'health and safety',
  },
  {
    keywords: ['fire safety issues'],
    titleMustInclude: 'fire safety',
  },
  {
    keywords: ['overall rating for the car park', 'car park'],
    titleMustInclude: 'car parks',
    titleMustNotInclude: ['garage'],
  },
  {
    keywords: ['abandoned vehicle', 'avs', 'authorisation to avs', 'cost code', 'authorising officer'],
    titleMustInclude: 'abandoned vehicles',
  },
  {
    keywords: ['garages and garage areas', 'garage areas'],
    titleMustInclude: 'garages',
  },
  {
    keywords: ['paths, roadways', 'roadways and courtyards'],
    titleMustInclude: 'paths',
  },
  {
    keywords: ['play areas and seating'],
    titleMustInclude: 'play areas',
  },
  {
    keywords: ['litter removal from communal'],
    titleMustInclude: 'litter removal',
  },
  {
    keywords: ['security of tank and meter'],
    titleMustInclude: 'tank and meter',
  },
  {
    keywords: ['rubbish chutes'],
    titleMustInclude: 'rubbish chutes',
  },
  {
    keywords: ['cleanliness of windows'],
    titleMustInclude: 'cleanliness of windows',
  },
  {
    keywords: ['cleanliness of ledges'],
    titleMustInclude: 'cleanliness of ledges',
  },
  {
    keywords: ['cleanliness of light fittings'],
    titleMustInclude: 'cleanliness of light',
  },
  {
    keywords: ['sweeping and washing of stairs'],
    titleMustInclude: 'sweeping and washing',
  },
  {
    keywords: ['entrance halls and lobbies'],
    titleMustInclude: 'entrance halls',
  },
  {
    keywords: ['handrails, ledges and banister'],
    titleMustInclude: 'handrails, ledges',
  },
  {
    keywords: ['lift floors', 'rating for lift floors'],
    titleMustInclude: 'floors',
    titleMustNotInclude: ['doors', 'panels'],
  },
  {
    keywords: ['lift doors', 'panels and frames', 'doors, panels'],
    titleMustInclude: 'doors',
    titleMustNotInclude: ['floors'],
  },
  {
    keywords: ['cleanliness of walls in communal'],
    titleMustInclude: 'walls in communal',
  },
  {
    keywords: ['overall rating for bin chambers'],
    titleMustInclude: 'bin chambers',
    titleMustNotInclude: ['bin shed', 'drying'],
  },
  {
    keywords: ['communal bin shed and drying'],
    titleMustInclude: 'bin shed',
  },
  {
    keywords: ['intake rooms and dry stores'],
    titleMustInclude: 'intake rooms',
  },
  {
    keywords: ['overall rating for fly tipping', 'rating for fly tipping'],
    titleMustInclude: 'fly tipping',
  },
  {
    keywords: ['signage around estates'],
    titleMustInclude: 'signage',
  },
  {
    keywords: ['recycling facilities'],
    titleMustInclude: 'recycling',
  },
  {
    keywords: ['fire hazards and combustible'],
    titleMustInclude: 'fire hazards',
  },
  {
    keywords: ['grassed areas', 'grounds maintenance', 'grass cutting/edging'],
    titleMustInclude: 'grassed',
  },
  {
    keywords: ['weed clearance'],
    titleMustInclude: 'weed',
  },
  {
    keywords: ['shrub bed and hedge maintenance'],
    titleMustInclude: 'shrub',
  },
  {
    keywords: ['tree management'],
    titleMustInclude: 'tree management',
  },
  {
    keywords: ['operational manager present', 'tenancy officer present', 'caretaker present', 'ward councillor', 'repairs officer present', 'resident representative'],
    titleMustInclude: 'staff present',
  },
  {
    keywords: ['grounds maintenance following inspection', 'quality of the paving', 'required communal repairs'],
    titleMustInclude: 'estate care',
  },
  {
    keywords: ['quality of the internal cleanliness', 'overall standards'],
    titleMustInclude: 'overall standards',
  },
  {
    keywords: ['4. item inspections', 'item inspections'],
    titleMustInclude: 'item inspections',
  },
  {
    keywords: ['sign to certify', 'date of the inspection completed today', 'signature and date'],
    titleMustInclude: 'signature',
  },
]

function sectionTitleLower(sec) {
  return String(sec?.title ?? sec?.name ?? '').trim().toLowerCase()
}

/**
 * @param {Record<string, unknown>} q
 * @param {Array<Record<string, unknown>>} sections
 */
function pickSectionLongestTitleInBlob(q, sections) {
  const blob = questionBlob(q)
  if (!blob) return null
  let best = null
  let bestLen = 0
  for (const sec of sections) {
    const t = sectionTitleLower(sec)
    if (t.length < 6) continue
    if (blob.includes(t) && t.length > bestLen) {
      best = sec
      bestLen = t.length
    }
  }
  return best
}

function pickSectionInternalShortTopic(q, sections) {
  const topic = firstLineTopic(q)
  if (!topic || !INTERNAL_CLEANING_TOPIC.test(topic)) return null
  const internal = sections.find((sec) => {
    const t = sectionTitleLower(sec)
    return t.includes('internal cleaning') && !t.includes('cleanliness of windows')
  })
  return internal || null
}

function pickSectionByKeywordRules(q, sections) {
  const blob = questionBlob(q)
  if (!blob) return null
  for (const rule of TOPIC_TITLE_RULES) {
    const hit = rule.keywords.some((k) => blob.includes(String(k).toLowerCase()))
    if (!hit) continue
    const must = String(rule.titleMustInclude).toLowerCase()
    const nots = (rule.titleMustNotInclude || []).map((x) => String(x).toLowerCase())
    const sec = sections.find((s) => {
      const t = sectionTitleLower(s)
      if (!t.includes(must)) return false
      return !nots.some((n) => t.includes(n))
    })
    if (sec) return sec
  }
  return null
}

/**
 * @param {Record<string, unknown>} q
 * @param {Array<Record<string, unknown>>} sections
 * @param {Map<string, string>} linkSidByQid
 */
function pickSectionLinked(q, sections, linkSidByQid) {
  const id = q?.id != null ? String(q.id) : null
  const sid = id ? linkSidByQid.get(id) : null
  if (!sid) return null
  return sections.find((s) => String(s.id) === String(sid)) || null
}

function questionOrderNum(q) {
  const n = Number(q?.question_order ?? q?.sort_order ?? q?.order ?? 0)
  return Number.isFinite(n) ? n : 0
}

function sortQuestions(qs) {
  return [...(qs || [])].sort((a, b) => questionOrderNum(a) - questionOrderNum(b))
}

/**
 * Rebuild `sections[].questions` so each question sits under the best-matching section heading.
 * @param {Array<Record<string, unknown> & { questions?: unknown[] }>} sections
 * @param {Map<string, string>} [linkSidByQid] question id → original section id from Airtable link (optional)
 * @returns {Array<Record<string, unknown> & { questions: unknown[] }>}
 */
export function repartitionEstateInspectionQuestions(sections, linkSidByQid = null) {
  if (!Array.isArray(sections) || sections.length === 0) return sections

  const sortedSecs = [...sections].sort((a, b) => sectionOrderNum(a) - sectionOrderNum(b))
  const all = []
  const seen = new Set()
  for (const sec of sortedSecs) {
    for (const q of sec.questions || []) {
      if (!q || q.id == null) continue
      const id = String(q.id)
      if (seen.has(id)) continue
      seen.add(id)
      all.push(q)
    }
  }
  if (all.length === 0) return sortedSecs

  const buckets = new Map(sortedSecs.map((s) => [String(s.id), []]))

  for (const q of all) {
    let target =
      pickSectionLongestTitleInBlob(q, sortedSecs) ||
      pickSectionInternalShortTopic(q, sortedSecs) ||
      pickSectionByKeywordRules(q, sortedSecs) ||
      (linkSidByQid ? pickSectionLinked(q, sortedSecs, linkSidByQid) : null) ||
      sortedSecs[0]
    const tid = String(target.id)
    if (!buckets.has(tid)) buckets.set(tid, [])
    buckets.get(tid).push(q)
  }

  return sortedSecs.map((sec) => ({
    ...sec,
    questions: sortQuestions(buckets.get(String(sec.id)) || []),
  }))
}

/**
 * Capture linked section ids before repartition (from question fields).
 * @param {unknown[]} questions
 */
export function buildQuestionOriginalSectionIdMap(questions) {
  const m = new Map()
  if (!Array.isArray(questions)) return m
  for (const q of questions) {
    if (!q || q.id == null) continue
    const sid = q.section_id ?? q.sectionId
    if (sid != null && String(sid).trim() !== '') m.set(String(q.id), String(sid).trim())
    const link = q.Section ?? q.section
    if (Array.isArray(link) && link[0]) m.set(String(q.id), String(link[0]).trim())
    else if (link != null && typeof link !== 'object') m.set(String(q.id), String(link).trim())
  }
  return m
}
