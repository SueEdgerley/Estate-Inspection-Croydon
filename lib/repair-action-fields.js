export async function ensureRepairActionFields(sql) {
  try {
    await sql`
      ALTER TABLE actions
      ADD COLUMN IF NOT EXISTS block_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS job_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS expected_completion_date DATE,
      ADD COLUMN IF NOT EXISTS repair_notes TEXT,
      ADD COLUMN IF NOT EXISTS repair_photo_url TEXT,
      ADD COLUMN IF NOT EXISTS repair_updated_at TIMESTAMPTZ
    `
    return true
  } catch (error) {
    console.warn('[repair-action-fields] optional repair fields unavailable:', error?.message || error)
    return false
  }
}
