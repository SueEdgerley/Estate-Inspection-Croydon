import AdHocInspectionForm from './AdHocInspectionForm'

export const dynamic = 'force-dynamic'

/**
 * Create Ad Hoc Inspection — Postgres-only create (no Airtable).
 */
export default function AdHocInspectionPage() {
  return <AdHocInspectionForm />
}
