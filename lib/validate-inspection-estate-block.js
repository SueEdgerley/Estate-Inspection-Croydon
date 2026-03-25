import { sql } from '@vercel/postgres'

/**
 * Ensures estate_id exists in Postgres and optional block_id belongs to that estate.
 * @returns {{ ok: true, estateId: string, blockId: string | null } | { ok: false, status: number, message: string }}
 */
export async function validateInspectionEstateAndBlock(estateIdRaw, blockIdRaw) {
  const estateTrim =
    estateIdRaw != null && String(estateIdRaw).trim() ? String(estateIdRaw).trim() : null
  if (!estateTrim) {
    return { ok: false, status: 400, message: 'estate_id is required' }
  }

  const er = await sql`SELECT id FROM estates WHERE id = ${estateTrim} LIMIT 1`
  if (er.rows.length === 0) {
    return { ok: false, status: 400, message: 'estate_id does not match a known estate' }
  }

  const blockTrim =
    blockIdRaw != null && String(blockIdRaw).trim() ? String(blockIdRaw).trim() : null
  if (!blockTrim) {
    return { ok: true, estateId: estateTrim, blockId: null }
  }

  const br = await sql`SELECT id, estate_id FROM blocks WHERE id = ${blockTrim} LIMIT 1`
  if (br.rows.length === 0) {
    return { ok: false, status: 400, message: 'block_id does not match a known block' }
  }

  const row = br.rows[0]
  if (!row.estate_id || row.estate_id !== estateTrim) {
    return { ok: false, status: 400, message: 'block must belong to the selected estate' }
  }

  return { ok: true, estateId: estateTrim, blockId: blockTrim }
}
