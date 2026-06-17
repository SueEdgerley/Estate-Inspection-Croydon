import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL)

// All caretaker inspections with actions where JOIN multiplies
const inflated = await sql`
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
  SELECT p.*, i.template_name, i.inspector_id, i.inspector_name, i.submitted_at
  FROM per_insp p
  JOIN inspections i ON i.id = p.inspection_id
  WHERE lower(coalesce(i.template_name,'')) LIKE '%caretaker%'
     OR lower(coalesce(i.type,'')) LIKE '%caretaker%'
  ORDER BY i.submitted_at DESC NULLS LAST
`
console.log('Caretaker JOIN inflated count:', inflated.length)
console.log(JSON.stringify(inflated.slice(0, 10), null, 2))

// Caretaker inspections with 1 action that appears 2x in join
const singleActionDoubled = await sql`
  SELECT a.inspection_id, i.template_name, i.inspector_id, i.submitted_at,
    COUNT(DISTINCT a.id)::int AS distinct_actions,
    COUNT(*)::int AS join_rows
  FROM actions a
  JOIN inspections i ON i.id = a.inspection_id
  LEFT JOIN users completed_user ON completed_user.clerk_user_id = i.inspector_id OR lower(trim(completed_user.email)) = lower(trim(i.inspector_id))
  LEFT JOIN people completed_person ON completed_person.id = completed_user.people_id OR lower(trim(completed_person.email)) = lower(trim(COALESCE(completed_user.email, i.inspector_id, '')))
  WHERE (lower(coalesce(i.template_name,'')) LIKE '%caretaker%' OR lower(coalesce(i.type,'')) LIKE '%caretaker%')
  GROUP BY a.inspection_id, i.template_name, i.inspector_id, i.submitted_at
  HAVING COUNT(DISTINCT a.id) = 1 AND COUNT(*) > 1
  ORDER BY i.submitted_at DESC NULLS LAST
  LIMIT 20
`
console.log('Single action doubled on UI:', JSON.stringify(singleActionDoubled, null, 2))

// Find caretaker inspections with similar titles (possible visual dupes, different question_ids)
const similarTitles = await sql`
  WITH caretaker_actions AS (
    SELECT a.*, i.template_name, i.submitted_at
    FROM actions a
    JOIN inspections i ON i.id = a.inspection_id
    WHERE lower(coalesce(i.template_name,'')) LIKE '%caretaker%'
       OR lower(coalesce(i.type,'')) LIKE '%caretaker%'
  )
  SELECT ca1.inspection_id, ca1.id AS id1, ca2.id AS id2,
    ca1.question_id AS q1, ca2.question_id AS q2,
    ca1.title, ca1.created_at AS t1, ca2.created_at AS t2
  FROM caretaker_actions ca1
  JOIN caretaker_actions ca2
    ON ca1.inspection_id = ca2.inspection_id
   AND ca1.id < ca2.id
   AND lower(trim(ca1.title)) = lower(trim(ca2.title))
  ORDER BY ca1.submitted_at DESC NULLS LAST
  LIMIT 20
`
console.log('Same-title pairs:', JSON.stringify(similarTitles, null, 2))

// Inspect 14e38698 - recent with 1 action - simulate API response count
const testId = '14e38698-2ca1-4115-a966-9a209c0f5e66'
const apiRows = await sql`
  SELECT a.id, a.question_id, a.title
  FROM actions a
  LEFT JOIN inspections i ON i.id = a.inspection_id
  LEFT JOIN template_versions tv ON tv.id = i.template_version_id
  LEFT JOIN users completed_user ON completed_user.clerk_user_id = i.inspector_id OR lower(trim(completed_user.email)) = lower(trim(i.inspector_id))
  LEFT JOIN people completed_person ON completed_person.id = completed_user.people_id OR lower(trim(completed_person.email)) = lower(trim(COALESCE(completed_user.email, i.inspector_id, '')))
  LEFT JOIN estates e ON e.id = i.estate_id
  LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
  LEFT JOIN people p ON p.id = a.recipient_person_id
  WHERE a.inspection_id = ${testId}
  ORDER BY a.created_at DESC
`
console.log(`API simulation for ${testId}:`, apiRows.length, 'rows', JSON.stringify(apiRows))

// PDF query simulation
const pdfRows = await sql`
  SELECT a.id, a.question_id, a.title
  FROM actions a
  LEFT JOIN inspections i ON i.id = a.inspection_id
  LEFT JOIN estates e ON e.id = i.estate_id
  LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
  LEFT JOIN people p ON p.id = a.recipient_person_id
  WHERE a.inspection_id = ${testId}
  ORDER BY a.created_at DESC
`
console.log(`PDF simulation for ${testId}:`, pdfRows.length, 'rows')
