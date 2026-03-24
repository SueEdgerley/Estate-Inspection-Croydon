import { getTemplatesNested } from '@/lib/airtable-client'
import AdHocInspectionForm from './AdHocInspectionForm'

export const dynamic = 'force-dynamic'

/**
 * Top-nav “Create Ad Hoc Inspection” — minimal fields only.
 * Default Airtable template is chosen server-side (no Templates UI).
 */
export default async function AdHocInspectionPage() {
  const hasAirtable =
    process.env.AIRTABLE_BASE_ID?.trim() &&
    (process.env.AIRTABLE_API_TOKEN?.trim() ||
      process.env.AIRTABLE_API_KEY?.trim() ||
      process.env.AIRTABLE_TOKEN?.trim())

  if (!hasAirtable) {
    return (
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          color: '#991b1b',
          maxWidth: '560px',
        }}
      >
        Airtable is not configured. Set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or API key) to create
        inspections.
      </div>
    )
  }

  let nested = []
  try {
    nested = await getTemplatesNested()
  } catch (e) {
    console.warn('[Ad hoc inspection] getTemplatesNested failed:', e?.message)
  }

  const envId = process.env.SIMPLE_INSPECTION_TEMPLATE_ID?.trim()
  const defaultTemplate = envId ? nested.find((t) => t.id === envId) : nested[0]

  if (!defaultTemplate) {
    return (
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '0.5rem',
          color: '#92400e',
          maxWidth: '560px',
        }}
      >
        No templates found in Airtable. Add at least one template, or set{' '}
        <code style={{ fontSize: '0.875em' }}>SIMPLE_INSPECTION_TEMPLATE_ID</code> to a template record id.
      </div>
    )
  }

  return <AdHocInspectionForm defaultTemplateId={defaultTemplate.id} />
}
