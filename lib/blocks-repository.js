/**
 * Shared create/upsert for inspection locations (blocks table).
 * Used by Admin API and CLI scripts so location management stays consistent.
 */
import { sql } from '@vercel/postgres'

const ID_PREFIX = 'blk_'
const ID_DIGITS = 6

export function formatBlkId(n) {
  return `${ID_PREFIX}${String(n).padStart(ID_DIGITS, '0')}`
}

export async function getNextBlkId() {
  const result = await sql`
    SELECT id FROM blocks
    WHERE id LIKE ${`${ID_PREFIX}%`} AND LENGTH(id) = ${ID_PREFIX.length + ID_DIGITS}
  `
  const re = new RegExp(`^${ID_PREFIX}([0-9]{${ID_DIGITS}})$`)
  let max = 0
  for (const row of result.rows || []) {
    const m = re.exec(String(row.id))
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return formatBlkId(max + 1)
}

/**
 * @param {{ name: string, estateId?: string|null, postcode?: string|null, active?: boolean, id?: string|null }} input
 */
export async function upsertBlock(input) {
  const name = input?.name && String(input.name).trim()
  if (!name) throw new Error('name is required')

  const estateId =
    input.estateId != null && String(input.estateId).trim()
      ? String(input.estateId).trim()
      : null
  const active = input.active === false ? false : true
  const postcode =
    input.postcode != null && String(input.postcode).trim()
      ? String(input.postcode).trim().slice(0, 20)
      : null
  const id =
    input.id && String(input.id).trim()
      ? String(input.id).trim()
      : await getNextBlkId()

  await sql`
    INSERT INTO blocks (id, estate_id, name, postcode, active)
    VALUES (${id}, ${estateId}, ${name}, ${postcode}, ${active})
    ON CONFLICT (id) DO UPDATE SET
      estate_id = EXCLUDED.estate_id,
      name = EXCLUDED.name,
      postcode = EXCLUDED.postcode,
      active = EXCLUDED.active,
      updated_at = CURRENT_TIMESTAMP
  `

  return { id, estate_id: estateId, name, postcode, active }
}

/**
 * Case-insensitive alphabetical sort for block/location labels.
 * @param {Array<{ name?: string, label?: string }>} rows
 * @param {(row: any) => string} getLabel
 */
export function sortBlocksByName(rows, getLabel = (row) => row?.name || row?.label || '') {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) =>
    String(getLabel(a) || '').localeCompare(String(getLabel(b) || ''), 'en-GB', {
      sensitivity: 'base',
      numeric: true,
    })
  )
}
