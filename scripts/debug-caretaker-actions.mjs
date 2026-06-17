import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })

const cs = process.env.POSTGRES_URL || process.env.DATABASE_URL
if (!cs) {
  console.log('NO_DB')
  process.exit(1)
}

const sql = neon(cs)

const inspections = await sql`
  SELECT i.id, i.template_name, i.type, i.submitted_at,
    (SELECT COUNT(*)::int FROM actions a WHERE a.inspection_id = i.id) AS action_count
  FROM inspections i
  WHERE (
    lower(coalesce(i.template_name,'')) LIKE '%caretaker%'
    OR lower(coalesce(i.type,'')) LIKE '%caretaker%'
    OR lower(coalesce(i.source,'')) LIKE '%caretaker%'
  )
  AND i.submitted_at IS NOT NULL
  ORDER BY i.submitted_at DESC
  LIMIT 10
`

console.log('Recent caretaker inspections:')
for (const row of inspections) {
  const dupes = await sql`
    SELECT question_id, COUNT(*)::int AS cnt, array_agg(id ORDER BY created_at) AS ids
    FROM actions
    WHERE inspection_id = ${row.id}
    GROUP BY question_id
    HAVING COUNT(*) > 1
  `
  const joinCount = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM actions a
    LEFT JOIN inspections i ON i.id = a.inspection_id
    LEFT JOIN users completed_user ON completed_user.clerk_user_id = i.inspector_id OR lower(trim(completed_user.email)) = lower(trim(i.inspector_id))
    LEFT JOIN people completed_person ON completed_person.id = completed_user.people_id OR lower(trim(completed_person.email)) = lower(trim(COALESCE(completed_user.email, i.inspector_id, '')))
    WHERE a.inspection_id = ${row.id}
  `
  const distinctActionIds = await sql`
    SELECT COUNT(DISTINCT a.id)::int AS cnt FROM actions a WHERE a.inspection_id = ${row.id}
  `
  console.log(JSON.stringify({
    id: row.id,
    template: row.template_name,
    submitted: row.submitted_at,
    db_actions: row.action_count,
    distinct_action_ids: distinctActionIds[0].cnt,
    join_rows: joinCount[0].cnt,
    dup_question_groups: dupes.length,
    dupes,
  }))
}
