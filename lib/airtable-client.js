// Airtable client for read-only config
// Templates, Sections, Questions, and People are read from Airtable
// Server-side only - uses environment variables

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

// Airtable table names (override via env if needed). Export for API routes.
export const TABLES = {
  TEMPLATES: process.env.AIRTABLE_TEMPLATES_TABLE || 'Templates',
  SECTIONS: process.env.AIRTABLE_SECTIONS_TABLE || 'Template Sections',
  QUESTIONS: process.env.AIRTABLE_QUESTIONS_TABLE || 'Template Questions',
  GRADING: process.env.AIRTABLE_GRADING_TABLE || 'Grading Schemes',
  PEOPLE: process.env.AIRTABLE_PEOPLE_TABLE || 'People',
  INSPECTIONS: process.env.AIRTABLE_INSPECTIONS_TABLE || 'Inspections',
  INSPECTION_RESPONSES: process.env.AIRTABLE_INSPECTION_RESPONSES_TABLE || 'Inspection Responses',
  ACTIONS: process.env.AIRTABLE_ACTIONS_TABLE || 'Actions',
}

/**
 * Fetch records from Airtable (server-side)
 */
async function fetchAirtableRecords(tableName, options = {}) {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    console.warn('Airtable credentials not configured.')
    console.warn('AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? 'Set' : 'Missing')
    console.warn('AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? 'Set' : 'Missing')
    throw new Error('Airtable credentials not configured. Please set AIRTABLE_BASE_ID and AIRTABLE_API_KEY environment variables.')
  }

  try {
    const params = new URLSearchParams()
    if (options.filterByFormula) {
      params.append('filterByFormula', options.filterByFormula)
    }
    if (options.view) {
      params.append('view', options.view)
    }
    if (options.sort) {
      options.sort.forEach((sort, index) => {
        params.append(`sort[${index}][field]`, sort.field)
        params.append(`sort[${index}][direction]`, sort.direction || 'asc')
      })
    }
    if (options.maxRecords) {
      params.append('maxRecords', options.maxRecords.toString())
    }

    const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/${tableName}?${params.toString()}`
    
    console.log(`[Airtable] Fetching from ${tableName}...`)
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      // Server-side: no caching for now
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Airtable] API error: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`Airtable API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    console.log(`[Airtable] Fetched ${data.records.length} records from ${tableName}`)
    
    return data.records.map(record => ({
      id: record.id,
      ...record.fields
    }))
  } catch (error) {
    console.error(`[Airtable] Error fetching from ${tableName}:`, error)
    throw error
  }
}

/**
 * Create a single record in Airtable. Returns the new record id.
 * fields: object with Airtable field names; use arrays for linked records.
 */
export async function createAirtableRecord(tableName, fields) {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    throw new Error('Airtable credentials not configured. Set AIRTABLE_BASE_ID and AIRTABLE_API_KEY.')
  }
  const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Airtable create failed: ${response.status} ${response.statusText} - ${errText}`)
  }
  const data = await response.json()
  return data.id
}

/**
 * Test function: Fetch first 5 records from Templates table
 * Logs the template_name field (or Name field) for each record
 */
export async function testAirtableConnection() {
  try {
    console.log('[Airtable Test] Starting connection test...')
    console.log('[Airtable Test] AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? 'Set' : 'Missing')
    console.log('[Airtable Test] AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? 'Set (hidden)' : 'Missing')
    
    const records = await fetchAirtableRecords(TABLES.TEMPLATES, {
      maxRecords: 5,
      sort: [{ field: 'Name', direction: 'asc' }]
    })
    
    console.log(`[Airtable Test] Successfully fetched ${records.length} template(s)`)
    
    records.forEach((record, index) => {
      // Try different possible field names
      const templateName = record['Name'] || record['Template Name'] || record['template_name'] || record.name || 'N/A'
      const recordId = record.id || 'N/A'
      
      console.log(`[Airtable Test] Template ${index + 1}:`)
      console.log(`  - Record ID: ${recordId}`)
      console.log(`  - Template Name: ${templateName}`)
      console.log(`  - All fields:`, Object.keys(record))
    })
    
    return {
      success: true,
      recordCount: records.length,
      records: records.map(record => ({
        id: record.id,
        name: record['Name'] || record['Template Name'] || record['template_name'] || record.name,
        allFields: Object.keys(record)
      }))
    }
  } catch (error) {
    console.error('[Airtable Test] Connection test failed:', error)
    return {
      success: false,
      error: error.message,
      details: error.toString()
    }
  }
}

// Resolve template name field (Name, Template Name, name)
function getTemplateName(r) {
  return r['Template Name'] ?? r['name'] ?? r['Name'] ?? ''
}
// Resolve active flag (Is Active, is_active, Active)
function getTemplateActive(r) {
  if (r['is_active'] !== undefined) return !!r['is_active']
  if (r['Is Active'] !== undefined) return !!r['Is Active']
  if (r['Active'] !== undefined) return !!r['Active']
  return true
}

/**
 * Template Model
 */
export async function getTemplates() {
  const records = await fetchAirtableRecords(TABLES.TEMPLATES)
  return records
    .filter(r => getTemplateActive(r))
    .sort((a, b) => (getTemplateName(a) || '').localeCompare(getTemplateName(b) || ''))
}

export async function getTemplateById(templateId) {
  // Try to fetch by Record ID field first
  let templates = await fetchAirtableRecords(TABLES.TEMPLATES, {
    filterByFormula: `{Record ID} = "${templateId}"`
  })
  
  // If not found, try fetching all and matching by Airtable record ID
  if (templates.length === 0) {
    templates = await fetchAirtableRecords(TABLES.TEMPLATES)
    templates = templates.filter(t => t.id === templateId)
  }
  
  return templates.length > 0 ? normalizeTemplate(templates[0]) : null
}

/**
 * Fetch all templates with nested sections and questions (for /api/templates).
 * Uses linked record fields: Template on sections, Section on questions.
 * Sorts sections by Section Order/sort_order, questions by Question Order.
 */
export async function getTemplatesNested() {
  const [templateRecords, sectionRecords, questionRecords] = await Promise.all([
    fetchAirtableRecords(TABLES.TEMPLATES),
    fetchAirtableRecords(TABLES.SECTIONS),
    fetchAirtableRecords(TABLES.QUESTIONS),
  ])

  const templates = templateRecords
    .filter(r => getTemplateActive(r))
    .map(t => {
      const templateId = t.id
      const templateKey = t['template_key'] ?? t['Template Key'] ?? t.template_key ?? ''
      const name = getTemplateName(t)

      const sectionList = (sectionRecords || [])
        .filter(s => {
          const link = s['Template'] ?? s.Template
          const ids = Array.isArray(link) ? link : (link ? [link] : [])
          return ids.includes(templateId)
        })
        .sort((a, b) => {
          const orderA = a['Section Order'] ?? a['sort_order'] ?? a.sort_order ?? 0
          const orderB = b['Section Order'] ?? b['sort_order'] ?? b.sort_order ?? 0
          return (Number(orderA) || 0) - (Number(orderB) || 0)
        })
        .map(s => {
          const sectionId = s.id
          const title = s['Section Title'] ?? s['section_title'] ?? s.title ?? s['Name'] ?? ''
          const sortOrder = s['Section Order'] ?? s['sort_order'] ?? s.sort_order ?? 0
          const helpText = s['Help Text'] ?? s.help_text ?? s.helpText ?? ''
          const isRepeatable = !!(s['Is Repeatable'] ?? s.is_repeatable ?? s.isRepeatable)

          const questions = (questionRecords || [])
            .filter(q => {
              const link = q['Section'] ?? q.Section
              const ids = Array.isArray(link) ? link : (link ? [link] : [])
              return ids.includes(sectionId)
            })
            .sort((a, b) => {
              const orderA = a['Question Order'] ?? a.question_order ?? a.sort_order ?? 0
              const orderB = b['Question Order'] ?? b.question_order ?? b.sort_order ?? 0
              return (Number(orderA) || 0) - (Number(orderB) || 0)
            })
            .map(q => {
              const depLink = q['Depends On Question'] ?? q.depends_on_question
              const depId = Array.isArray(depLink) ? depLink[0] : depLink
              const gradingLink = q['Grading Scheme'] ?? q.grading_scheme
              const gradingId = Array.isArray(gradingLink) ? gradingLink[0] : gradingLink
              const opts = q['Options'] ?? q.options
              const options = typeof opts === 'string' ? (opts ? opts.split(',').map(o => o.trim()) : []) : (Array.isArray(opts) ? opts : [])

              return {
                id: q.id,
                question_text: q['Question Text'] ?? q.question_text ?? q.label ?? '',
                question_type: (q['Question Type'] ?? q.question_type ?? 'text').toString().toLowerCase().replace(/[\s-]/g, '_'),
                sort_order: q['Question Order'] ?? q.question_order ?? q.sort_order ?? 0,
                options,
                is_required: !!(q['Is Required'] ?? q.is_required ?? q.required),
                depends_on_question_id: depId || null,
                show_when_value: q['Show When Value'] ?? q.show_when_value,
                create_action_on_no: !!(q['Create Action On No'] ?? q.create_action_on_no),
                action_category: q['Action Category'] ?? q.action_category ?? '',
                require_photo_on_no: !!(q['Require Photo On No'] ?? q.require_photo_on_no),
                require_comment_on_no: !!(q['Require Comment On No'] ?? q.require_comment_on_no),
                grading_scheme_id: gradingId || null,
              }
            })

          return {
            id: s.id,
            title,
            sort_order: Number(sortOrder) || 0,
            help_text: helpText,
            is_repeatable: isRepeatable,
            questions,
          }
        })

      return {
        id: t.id,
        template_key: templateKey,
        name,
        sections: sectionList,
      }
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  return templates
}

/**
 * Section Model
 */
export async function getTemplateSections(templateId) {
  return await fetchAirtableRecords(TABLES.SECTIONS, {
    filterByFormula: `AND({Template ID} = "${templateId}", {Active} = TRUE())`,
    sort: [{ field: 'Order', direction: 'asc' }]
  })
}

export async function getSectionById(sectionId) {
  const sections = await fetchAirtableRecords(TABLES.SECTIONS, {
    filterByFormula: `{Record ID} = "${sectionId}"`
  })
  return sections[0] || null
}

/**
 * Question Model
 */
export async function getSectionQuestions(sectionId) {
  return await fetchAirtableRecords(TABLES.QUESTIONS, {
    filterByFormula: `AND({Section ID} = "${sectionId}", {Active} = TRUE())`,
    sort: [{ field: 'Order', direction: 'asc' }]
  })
}

export async function getQuestionById(questionId) {
  const questions = await fetchAirtableRecords(TABLES.QUESTIONS, {
    filterByFormula: `{Record ID} = "${questionId}"`
  })
  return questions[0] || null
}

/**
 * People Model (for recipient selection)
 */
export async function getPeople() {
  return await fetchAirtableRecords(TABLES.PEOPLE, {
    filterByFormula: "{Active} = TRUE()",
    sort: [{ field: 'Name', direction: 'asc' }]
  })
}

export async function getPersonById(personId) {
  const people = await fetchAirtableRecords(TABLES.PEOPLE, {
    filterByFormula: `{Record ID} = "${personId}"`
  })
  return people[0] || null
}

/**
 * Get all questions for a template (across all sections)
 */
export async function getTemplateQuestions(templateId) {
  const sections = await getTemplateSections(templateId)
  const allQuestions = []
  
  for (const section of sections) {
    const questions = await getSectionQuestions(section.id)
    allQuestions.push(...questions.map(q => ({ ...q, section_id: section.id, section_name: section.Name })))
  }
  
  return allQuestions
}

/**
 * Normalize Airtable field names to our internal format
 */
export function normalizeQuestion(airtableQuestion) {
  return {
    id: airtableQuestion['Record ID'] || airtableQuestion.id,
    section_id: airtableQuestion['Section ID'] || airtableQuestion.section_id,
    label: airtableQuestion['Question Text'] || airtableQuestion.label,
    question_type: (airtableQuestion['Question Type'] || airtableQuestion.question_type || 'yesno').toLowerCase(),
    is_required: airtableQuestion['Required'] || airtableQuestion.is_required || false,
    depends_on_question_id: airtableQuestion['Depends On Question ID'] || airtableQuestion.depends_on_question_id,
    show_when_value: airtableQuestion['Show When Value'] !== undefined 
      ? airtableQuestion['Show When Value'] 
      : airtableQuestion.show_when_value,
    description: airtableQuestion['Description'] || airtableQuestion.description,
    options: airtableQuestion['Options'] || airtableQuestion.options || [],
    // Action creation fields
    action_category: airtableQuestion['Action Category'] || airtableQuestion.action_category,
    action_priority: airtableQuestion['Action Priority'] || airtableQuestion.action_priority,
    require_photo_on_no: airtableQuestion['Require Photo on No'] !== undefined 
      ? airtableQuestion['Require Photo on No'] 
      : (airtableQuestion.require_photo_on_no !== undefined ? airtableQuestion.require_photo_on_no : true),
    require_comment_on_no: airtableQuestion['Require Comment on No'] !== undefined 
      ? airtableQuestion['Require Comment on No'] 
      : (airtableQuestion.require_comment_on_no !== undefined ? airtableQuestion.require_comment_on_no : true),
    create_action_on_no: airtableQuestion['Create Action on No'] !== undefined 
      ? airtableQuestion['Create Action on No'] 
      : (airtableQuestion.create_action_on_no !== undefined ? airtableQuestion.create_action_on_no : true),
    order: airtableQuestion['Order'] || airtableQuestion.order || 0
  }
}

export function normalizeSection(airtableSection) {
  return {
    id: airtableSection['Record ID'] || airtableSection.id,
    template_id: airtableSection['Template ID'] || airtableSection.template_id,
    name: airtableSection['Name'] || airtableSection.name,
    order: airtableSection['Order'] || airtableSection.order || 0,
    section_type: airtableSection['Section Type'] || airtableSection.section_type || 'standard'
  }
}

export function normalizeTemplate(airtableTemplate) {
  return {
    id: airtableTemplate['Record ID'] || airtableTemplate.id,
    name: airtableTemplate['Name'] || airtableTemplate.name,
    description: airtableTemplate['Description'] || airtableTemplate.description,
    template_type: airtableTemplate['Template Type'] || airtableTemplate.template_type || 'standard'
  }
}

export function normalizePerson(airtablePerson) {
  return {
    id: airtablePerson['Record ID'] || airtablePerson.id,
    airtable_id: airtablePerson.id,
    name: airtablePerson['Name'] || airtablePerson.name,
    email: airtablePerson['Email'] || airtablePerson.email,
    role: airtablePerson['Role'] || airtablePerson.role,
    category: airtablePerson['Category'] || airtablePerson.category,
    active: airtablePerson['Active'] !== undefined ? airtablePerson['Active'] : true
  }
}
