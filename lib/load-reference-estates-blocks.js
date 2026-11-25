import { unstable_noStore as noStore } from 'next/cache'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

/**
 * Estates and blocks for inspection forms — Neon/Postgres only (admin reference data).
 * Blocks are the current location list (active only). Estates are loaded for future use; UI can ignore.
 * noStore() skips Next's stored fetch result. The sql helper uses fetch, and force-dynamic
 * alone does not stop an old block list being reused after rows are split or retired.
 */
export async function loadEstatesAndBlocksForInspectionForm() {
  noStore()
  if (!getPgUrl()) return { estates: [], blocks: [] }
  try {
    await ensureDatabase()
    const [eRes, bRes] = await Promise.all([
      sql`SELECT id, name FROM estates ORDER BY LOWER(name), name`,
      sql`SELECT id, estate_id, name, postcode, active FROM blocks WHERE COALESCE(active, true) = true ORDER BY LOWER(name), name`,
    ])
    return { estates: eRes.rows, blocks: bRes.rows }
  } catch (e) {
    console.warn('[inspection form] Failed to load estates/blocks from Postgres:', e?.message)
    return { estates: [], blocks: [] }
  }
}
