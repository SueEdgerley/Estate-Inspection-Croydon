/**
 * Columns and the retry queue for new Estate Services photo actions.
 * Historic rows are not backfilled.
 */
export async function ensureCaretakerActionTrackingFields(sql) {
  if (typeof sql?.query !== 'function') return false
  try {
    await sql.query(`
      ALTER TABLE actions
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS notification_claim_at TIMESTAMPTZ
    `)
    await sql.query(`
      CREATE TABLE IF NOT EXISTS caretaker_estates_action_recovery (
        inspection_id VARCHAR(255) NOT NULL,
        question_id VARCHAR(255) NOT NULL,
        stage VARCHAR(40) NOT NULL,
        last_error TEXT,
        payload JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (inspection_id, question_id)
      )
    `)
    return true
  } catch (error) {
    console.warn('[caretaker-estates-action-fields] unavailable:', error?.message || error)
    return false
  }
}
