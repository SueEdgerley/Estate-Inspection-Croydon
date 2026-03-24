import { getBlocksCached } from '@/lib/airtable-client'
import NewInspectionForm from './NewInspectionForm'

export const dynamic = 'force-dynamic'

/**
 * Server page: fetch Blocks once from Airtable (60s cache), pass to form.
 * Dropdown stores Airtable record id (block.id). No client-side block fetch.
 */
export default async function NewInspectionPage() {
  let blocks = []
  const hasAirtable =
    process.env.AIRTABLE_BASE_ID?.trim() &&
    (process.env.AIRTABLE_API_TOKEN?.trim() ||
      process.env.AIRTABLE_API_KEY?.trim())
  if (hasAirtable) {
    try {
      blocks = await getBlocksCached()
    } catch (e) {
      console.warn('[New inspection] getBlocksCached failed:', e?.message)
    }
  }
  console.log('Blocks loaded:', blocks.length)
  return <NewInspectionForm initialBlocks={blocks} />
}
