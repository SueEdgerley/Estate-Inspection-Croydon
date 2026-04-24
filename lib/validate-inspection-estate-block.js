import { sql } from '@vercel/postgres'

/**
 * Optional estate and/or block for inspections.
 * Block must exist and be active; estate_id on the block is not validated against the selected
 * estate (estates are not live yet — blocks are the location list for now).
 *
 * @returns {{ ok: true, estateId: string | null, blockId: string | null } | { ok: false, status: number, message: string }}
 */
export async function validateInspectionEstateAndBlock(estateIdRaw, blockIdRaw) {
  const estateTrim =
    estateIdRaw != null && String(estateIdRaw).trim() ? String(estateIdRaw).trim() : null
  const blockTrim =
    blockIdRaw != null && String(blockIdRaw).trim() ? String(blockIdRaw).trim() : null

  if (blockTrim) {
    const br = await sql`
      SELECT id FROM blocks
      WHERE id = ${blockTrim} AND COALESCE(active, true) = true
      LIMIT 1
    `
    if (br.rows.length === 0) {
      return { ok: false, status: 400, message: 'block_id does not match an active block' }
    }
  }

  if (estateTrim) {
    const er = await sql`SELECT id FROM estates WHERE id = ${estateTrim} LIMIT 1`
    if (er.rows.length === 0) {
      return { ok: false, status: 400, message: 'estate_id does not match a known estate' }
    }
  }

  return { ok: true, estateId: estateTrim, blockId: blockTrim }
}
