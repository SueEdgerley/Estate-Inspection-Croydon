import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL)

// Inspections where JOIN multiplies rows
const joinInflated = await sql`
  WITH counts AS (
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
  SELECT c.*, i.template_name, i.type, i.submitted_at
  FROM counts c
  JOIN inspections i ON i.id = c.inspection_id
  WHERE lower(coalesce(i.template_name,'')) LIKE '%caretaker%'
     OR lower(coalesce(i.type,'')) LIKE '%caretaker%'
  ORDER BY i.submitted_at DESC NULLS LAST
  LIMIT 15
`
console.log('JOIN-inflated caretaker inspections:', JSON.stringify(joinInflated, null, 2))

// Duplicate question_id groups in caretaker inspections
const dupQuestions = await sql`
  SELECT a.inspection_id, i.template_name, i.submitted_at,
    a.question_id, COUNT(*)::int AS cnt,
    array_agg(a.id ORDER BY a.created_at) AS action_ids,
    array_agg(a.title ORDER BY a.created_at) AS titles
  FROM actions a
  JOIN inspections i ON i.id = a.inspection_id
  WHERE (
    lower(coalesce(i.template_name,'')) LIKE '%caretaker%'
    OR lower(coalesce(i.type,'')) LIKE '%caretaker%'
  )
  GROUP BY a.inspection_id, i.template_name, i.submitted_at, a.question_id
  HAVING COUNT(*) > 1
  ORDER BY i.submitted_at DESC NULLS LAST
  LIMIT 15
`
console.log('Duplicate question_id groups:', JSON.stringify(dupQuestions, null, 2))

// Inspections with 2+ actions - show details for most recent with join inflation globally
const globalJoinInflated = await sql`
  WITH counts AS (
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
  SELECT c.*, i.template_name, i.type, i.submitted_at, i.inspector_id
  FROM counts c
  JOIN inspections i ON i.id = c.inspection_id
  ORDER BY i.submitted_at DESC NULLS LAST
  LIMIT 20
`
console.log('Global JOIN-inflated (any template):', JSON.stringify(globalJoinInflated, null, 2))

// Pick one inflated inspection and show per-action join multiplicity
if (globalJoinInflated.length > 0) {
  const testId = globalJoinInflated[0].inspection_id
  const perAction = await sql`
    SELECT a.id, a.question_id, a.title, COUNT(*)::int AS join_rows
    FROM actions a
    LEFT JOIN inspections i ON i.id = a.inspection_id
    LEFT JOIN users completed_user ON completed_user.clerk_user_id = i.inspector_id OR lower(trim(completed_user.email)) = lower(trim(i.inspector_id))
    LEFT JOIN people completed_person ON completed_person.id = completed_user.people_id OR lower(trim(completed_person.email)) = lower(trim(COALESCE(completed_user.email, i.inspector_id, '')))
    WHERE a.inspection_id = ${testId}
    GROUP BY a.id, a.question_id, a.title
    ORDER BY join_rows DESC, a.id
  `
  const inspectorUsers = await sql`
    SELECT u.id, u.clerk_user_id, u.email, u.people_id
    FROM inspections i
    JOIN users u ON u.clerk_user_id = i.inspector_id OR lower(trim(u.email)) = lower(trim(i.inspector_id))
    WHERE i.id = ${testId}
  `
  console.log('Sample inflated inspection:', testId)
  console.log('Per-action join rows:', JSON.stringify(perAction, null, 2))
  console.log('Matching users:', JSON.stringify(inspectorUsers, null, 2))
}

// Inspect 737254a0 which has 2 distinct actions - are they similar?
const twoActionInsp = '737254a0-fc57-497b-b252-fa3aefce547a'
const actions = await sql`
  SELECT id, question_id, title, category, auto_created, created_at
  FROM actions WHERE inspection_id = ${twoActionInsp} ORDER BY created_at
`
console.log('Two-action inspection details:', JSON.stringify(actions, null, 2))
