export async function ensureRepairActionFields(sql) {
  try {
    await sql`
      ALTER TABLE actions
      ADD COLUMN IF NOT EXISTS repair_notes TEXT,
      ADD COLUMN IF NOT EXISTS repair_photo_url TEXT,
      ADD COLUMN IF NOT EXISTS repair_updated_at TIMESTAMPTZ
    `
  } catch (error) {
    console.warn('[repair-action-fields] optional repair fields unavailable:', error?.message || error)
  }
}
