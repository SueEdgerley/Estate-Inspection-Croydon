import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

/**
 * Estates and blocks for inspection forms — Neon/Postgres only (admin reference data).
 */
export async function loadEstatesAndBlocksForInspectionForm() {
  if (!getPgUrl()) return { estates: [], blocks: [] }
  try {
    await ensureDatabase()
    const [eRes, bRes] = await Promise.all([
      sql`SELECT id, name FROM estates ORDER BY name`,
      sql`SELECT id, estate_id, name FROM blocks ORDER BY name`,
    ])
    return { estates: eRes.rows, blocks: bRes.rows }
  } catch (e) {
    console.warn('[inspection form] Failed to load estates/blocks from Postgres:', e?.message)
    return { estates: [], blocks: [] }
  }
}
