'use client'

import NewInspectionForm from './NewInspectionForm'

/**
 * New inspection page. Blocks are loaded client-side from /api/blocks (Airtable)
 * so the build does not require Airtable env. Dropdown value = Block record ID.
 */
export default function NewInspectionPage() {
  return <NewInspectionForm />
}
