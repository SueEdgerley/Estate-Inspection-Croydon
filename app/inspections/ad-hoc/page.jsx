import { loadEstatesAndBlocksForInspectionForm } from '@/lib/load-reference-estates-blocks'
import AdHocInspectionForm from './AdHocInspectionForm'

export const dynamic = 'force-dynamic'

/**
 * Ad hoc inspection — Postgres-only create; estate/block pickers use same reference data as New Inspection.
 */
export default async function AdHocInspectionPage() {
  const { blocks } = await loadEstatesAndBlocksForInspectionForm()
  return <AdHocInspectionForm initialBlocks={blocks} />
}
