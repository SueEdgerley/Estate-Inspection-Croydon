import { sqlExcludeFalseAutoActions } from '@/lib/false-action-cleanup'

export async function ensureIssueNumberFields(sql) {
  try {
    await sql.query('CREATE SEQUENCE IF NOT EXISTS actions_issue_number_seq')
    await sql.query('ALTER TABLE actions ADD COLUMN IF NOT EXISTS issue_number INTEGER')
    await sql.query('CREATE UNIQUE INDEX IF NOT EXISTS actions_issue_number_key ON actions (issue_number)')
    const maxRow = await sql.query('SELECT COALESCE(MAX(issue_number), 0)::int AS max FROM actions')
    const max = Number(maxRow.rows[0]?.max || 0)
    if (max > 0) {
      await sql.query('SELECT setval($1, $2, true)', ['actions_issue_number_seq', max])
    }
    // Do not attach DEFAULT until historical genuine rows are numbered, otherwise
    // new inserts would consume 1..N and collide with the created_at backfill.
    const pending = await sql.query(
      `SELECT COUNT(*)::int AS total
       FROM actions
       WHERE issue_number IS NULL AND ${sqlExcludeFalseAutoActions('actions')}`
    )
    const pendingGenuine = Number(pending.rows[0]?.total || 0)
    if (max > 0 && pendingGenuine === 0) {
      await sql.query(
        "ALTER TABLE actions ALTER COLUMN issue_number SET DEFAULT nextval('actions_issue_number_seq')"
      )
    }
    return true
  } catch (error) {
    console.warn('[issue-number-fields] unavailable:', error?.message || error)
    return false
  }
}
