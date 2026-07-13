/**
 * Follow-up: Grounds Maintenance inspections — when submitted, what columns hold the name.
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
config({ path: '.env' })

const cs = process.env.POSTGRES_URL || process.env.DATABASE_URL
if (!cs) process.exit(1)

const sql = neon(cs)

const allGm = await sql`
  SELECT
    id,
    inspector_id,
    trim(coalesce(template_name, '')) AS template_name,
    trim(coalesce(type, '')) AS type,
    trim(coalesce(template_id, '')) AS template_id,
    status,
    submitted_at,
    created_at,
    due_date
  FROM inspections
  WHERE lower(coalesce(template_name, '')) LIKE '%ground%'
     OR lower(coalesce(type, '')) LIKE '%ground%'
     OR template_id IN (
       SELECT DISTINCT template_id FROM inspections
       WHERE trim(coalesce(template_name, '')) = 'Grounds Maintenance'
     )
  ORDER BY submitted_at NULLS LAST, created_at
`

console.log('=== All Grounds Maintenance-ish inspections ===')
console.log('Total:', allGm.length)
if (allGm.length) console.table(allGm)

const byMonth = await sql`
  SELECT
    to_char(submitted_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month_utc,
    COUNT(*)::int AS count
  FROM inspections
  WHERE trim(coalesce(template_name, '')) = 'Grounds Maintenance'
    AND submitted_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1
`

console.log('\n=== GM submissions by month (UTC, template_name exact) ===')
console.table(byMonth)

const juneByCreated = await sql`
  SELECT COUNT(*)::int AS count
  FROM inspections
  WHERE trim(coalesce(template_name, '')) = 'Grounds Maintenance'
    AND created_at >= '2026-06-01'::timestamptz
    AND created_at <= '2026-06-30 23:59:59'::timestamptz
`

const juneByDue = await sql`
  SELECT COUNT(*)::int AS count
  FROM inspections
  WHERE trim(coalesce(template_name, '')) = 'Grounds Maintenance'
    AND due_date >= '2026-06-01'::date
    AND due_date <= '2026-06-30'::date
`

console.log('\n=== GM in June by alternate date fields ===')
console.log('created_at in June:', juneByCreated[0]?.count)
console.log('due_date in June:', juneByDue[0]?.count)

const templatesTable = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE '%template%'
  ORDER BY 1
`
console.log('\n=== Template-related tables ===')
console.log(templatesTable.map((r) => r.table_name))

const gmTemplateVersions = await sql`
  SELECT id, template_id, template_name, created_at
  FROM template_versions
  WHERE lower(coalesce(template_name, '')) LIKE '%ground%'
  ORDER BY created_at DESC
  LIMIT 10
`.catch(() => [])

console.log('\n=== template_versions matching ground ===')
console.table(gmTemplateVersions)
