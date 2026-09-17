import { sqlExcludeFalseAutoActions } from '@/lib/false-action-cleanup'

export const OPENISH_ACTION_SQL = `lower(trim(COALESCE(status, ''))) IN ('open', 'in_progress', 'in progress')`

export const ASSIGN_ISSUE_NUMBERS_SQL = `
WITH bounds AS (
  SELECT COALESCE(MAX(issue_number), 0) AS start_n FROM actions
), numbered AS (
  SELECT
    a.id,
    bounds.start_n + ROW_NUMBER() OVER (ORDER BY a.created_at ASC, a.id ASC) AS n
  FROM actions a
  CROSS JOIN bounds
  WHERE a.issue_number IS NULL
    AND ${sqlExcludeFalseAutoActions('a')}
)
UPDATE actions AS target
SET issue_number = numbered.n
FROM numbered
WHERE target.id = numbered.id
RETURNING target.id, target.issue_number, target.created_at, target.status
`

export const SET_ISSUE_NUMBER_DEFAULT_SQL =
  "ALTER TABLE actions ALTER COLUMN issue_number SET DEFAULT nextval('actions_issue_number_seq')"
