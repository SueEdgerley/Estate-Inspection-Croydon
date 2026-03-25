import { loadEstatesAndBlocksForInspectionForm } from '@/lib/load-reference-estates-blocks'
import NewInspectionForm from './NewInspectionForm'

export const dynamic = 'force-dynamic'

/**
 * New inspection — estates/blocks from Neon/Postgres only. Templates still from Airtable via client fetch.
 */
export default async function NewInspectionPage() {
  const { estates, blocks } = await loadEstatesAndBlocksForInspectionForm()
  return <NewInspectionForm initialEstates={estates} initialBlocks={blocks} />
}
