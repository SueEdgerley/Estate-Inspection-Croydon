import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL)

// Broader: any inspection with actions where API join doubles rows
const allInflated = await sql`
  WITH per_insp AS (
    SELECT a.inspection_id,
      COUNT(*)::int AS join_rows,
      COUNT(DISTINCT a.id)::int AS distinct_actions
    FROM actions a
    LEFT JOIN inspections i ON i.id = a.inspection_id
    LEFT JOIN users completed_user ON completed_user.clerk_user_id = i.inspector_id OR lower(trim(completed_user.email)) = lower(trim(i.inspector_id))
    LEFT JOIN people completed_person ON completed_person.id = completed_user.people_id OR lower(trim(completed_person.email)) = lower(trim(COALESCE(completed_user.email, i.inspector_id, '')))
    GROUP BY a.inspection_id
    HAVING COUNT(*) > COUNT(DISTINCT a.id)
  )
  SELECT p.*, i.template_name, i.type, i.inspector_id, i.submitted_at
  FROM per_insp p
  JOIN inspections i ON i.id = p.inspection_id
  ORDER BY i.submitted_at DESC NULLS LAST
`
console.log('All inflated inspections:', allInflated.length)
for (const row of allInflated) {
  console.log(JSON.stringify(row))
}

// Duplicate question_id in actions table (any template)
const dbDupes = await sql`
  SELECT a.inspection_id, i.template_name, i.type, a.question_id,
    COUNT(*)::int AS cnt,
    array_agg(a.id ORDER BY a.created_at) AS ids,
    array_agg(a.auto_created ORDER BY a.created_at) AS auto_flags
  FROM actions a
  JOIN inspections i ON i.id = a.inspection_id
  WHERE a.question_id IS NOT NULL
  GROUP BY a.inspection_id, i.template_name, i.type, a.question_id
  HAVING COUNT(*) > 1
  ORDER BY MAX(i.submitted_at) DESC NULLS LAST
  LIMIT 30
`
console.log('\nDB duplicate question_id groups:', dbDupes.length)
for (const row of dbDupes) {
  console.log(JSON.stringify(row))
}

// Caretaker inspections with multiple actions - list all
const multi = await sql`
  SELECT i.id, i.template_name, i.submitted_at, i.inspector_id,
    COUNT(a.id)::int AS action_count,
    array_agg(a.question_id ORDER BY a.created_at) AS question_ids,
    array_agg(a.title ORDER BY a.created_at) AS titles
  FROM inspections i
  JOIN actions a ON a.inspection_id = i.id
  WHERE lower(coalesce(i.template_name,'')) LIKE '%caretaker%'
  GROUP BY i.id, i.template_name, i.submitted_at, i.inspector_id
  HAVING COUNT(a.id) >= 2
  ORDER BY i.submitted_at DESC
  LIMIT 30
`
console.log('\nCaretaker inspections with 2+ actions:', multi.length)
for (const row of multi) {
  console.log(JSON.stringify(row))
}

// Inspectors with duplicate user rows (email collision)
const dupUsers = await sql`
  SELECT lower(trim(email)) AS email, COUNT(*)::int AS cnt,
    array_agg(clerk_user_id) AS clerk_ids
  FROM users
  WHERE email IS NOT NULL AND trim(email) <> ''
  GROUP BY lower(trim(email))
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC
  LIMIT 20
`
console.log('\nDuplicate user emails:', dupUsers.length)
for (const row of dupUsers.slice(0, 5)) {
  console.log(JSON.stringify(row))
}
