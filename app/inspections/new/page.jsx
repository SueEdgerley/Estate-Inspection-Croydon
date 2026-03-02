import { getBlocks } from '@/lib/airtable-client'
import NewInspectionForm from './NewInspectionForm'

export const dynamic = 'force-dynamic'

/**
 * Server component: fetch Blocks from Airtable and pass to the inspection form.
 * Block dropdown stores the Airtable record ID (block.id), not the name.
 */
export default async function NewInspectionPage() {
  let blocks = []
  try {
    blocks = await getBlocks()
  } catch (e) {
    console.warn('[New inspection] getBlocks failed:', e?.message)
  }
  return <NewInspectionForm initialBlocks={blocks} />
}
