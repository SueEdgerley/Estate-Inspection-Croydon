const ARCHIVED_TEMPLATE_IDS = new Set([
  // Broken Airtable Estate Walkabout row: 5 sections, 0 questions.
  'recB4Mb77J4HxiVPK',
])

export function isArchivedTemplateId(templateId) {
  return ARCHIVED_TEMPLATE_IDS.has(String(templateId || '').trim())
}

export function filterArchivedTemplates(templates) {
  if (!Array.isArray(templates)) return []
  return templates.filter((template) => !isArchivedTemplateId(template?.id ?? template?.template_id))
}
