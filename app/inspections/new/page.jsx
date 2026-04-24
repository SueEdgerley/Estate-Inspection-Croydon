import { loadEstatesAndBlocksForInspectionForm } from '@/lib/load-reference-estates-blocks'
import NewInspectionForm from './NewInspectionForm'

export const dynamic = 'force-dynamic'

/**
 * New inspection — active blocks from Neon/Postgres as the location list. Templates from Airtable via client fetch.
 */
export default async function NewInspectionPage() {
  const { blocks } = await loadEstatesAndBlocksForInspectionForm()
  return <NewInspectionForm initialBlocks={blocks} />
}
