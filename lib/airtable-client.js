// Airtable client for read-only config
// Templates, Sections, Questions, and People are read from Airtable
// Server-side only - uses environment variables

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

// Airtable table names
const TABLES = {
  TEMPLATES: 'Templates',
  SECTIONS: 'Sections',
  QUESTIONS: 'Template Questions',
  PEOPLE: 'People'
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

/**
 * Template Model
 */
export async function getTemplates() {
  return await fetchAirtableRecords(TABLES.TEMPLATES, {
    filterByFormula: "{Active} = TRUE()",
    sort: [{ field: 'Name', direction: 'asc' }]
  })
}

export async function getTemplateById(templateId) {
  const templates = await fetchAirtableRecords(TABLES.TEMPLATES, {
    filterByFormula: `{Record ID} = "${templateId}"`
  })
  return templates[0] || null
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
