/**
 * One-off investigation: June 2026 Grounds Maintenance template values in production DB.
 * Run: node scripts/investigate-analytics-june-gm.mjs
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
config({ path: '.env' })

const cs =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.NEON_DATABASE_URL

if (!cs) {
  console.error('No database connection string in .env.local / .env')
  process.exit(1)
}

const sql = neon(cs)

const DATE_FROM = '2026-06-01'
const DATE_TO = '2026-06-30 23:59:59'

async function run() {
  const submittedJune = await sql`
    SELECT COUNT(*)::int AS count
    FROM inspections
    WHERE (submitted_at IS NOT NULL OR lower(trim(COALESCE(status, ''))) IN ('submitted', 'completed', 'complete'))
      AND submitted_at >= ${DATE_FROM}::timestamptz
      AND submitted_at <= ${DATE_TO}::timestamptz
  `

  const distinctNames = await sql`
    SELECT
      trim(coalesce(template_name, '')) AS template_name,
      trim(coalesce(type, '')) AS type,
      trim(coalesce(template_id, '')) AS template_id,
      COUNT(*)::int AS count
    FROM inspections
    WHERE (submitted_at IS NOT NULL OR lower(trim(COALESCE(status, ''))) IN ('submitted', 'completed', 'complete'))
      AND submitted_at >= ${DATE_FROM}::timestamptz
      AND submitted_at <= ${DATE_TO}::timestamptz
    GROUP BY 1, 2, 3
    ORDER BY count DESC, template_name, type
  `

  const groundsLike = await sql`
    SELECT
      id,
      inspector_id,
      trim(coalesce(template_name, '')) AS template_name,
      trim(coalesce(type, '')) AS type,
      trim(coalesce(template_id, '')) AS template_id,
      status,
      submitted_at
    FROM inspections
    WHERE (submitted_at IS NOT NULL OR lower(trim(COALESCE(status, ''))) IN ('submitted', 'completed', 'complete'))
      AND submitted_at >= ${DATE_FROM}::timestamptz
      AND submitted_at <= ${DATE_TO}::timestamptz
      AND (
        lower(coalesce(template_name, '')) LIKE '%ground%'
        OR lower(coalesce(type, '')) LIKE '%ground%'
        OR lower(coalesce(template_name, '')) LIKE '%maintenance%'
        OR lower(coalesce(type, '')) LIKE '%maintenance%'
      )
    ORDER BY submitted_at
  `

  const dropdownOptions = await sql`
    SELECT DISTINCT TRIM(template_name) AS template_name
    FROM inspections
    WHERE NULLIF(trim(template_name), '') IS NOT NULL
    ORDER BY template_name
  `

  const exactFilterCount = await sql`
    SELECT COUNT(*)::int AS count
    FROM inspections
    WHERE (submitted_at IS NOT NULL OR lower(trim(COALESCE(status, ''))) IN ('submitted', 'completed', 'complete'))
      AND submitted_at >= ${DATE_FROM}::timestamptz
      AND submitted_at <= ${DATE_TO}::timestamptz
      AND trim(coalesce(template_name, '')) = ${'Grounds Maintenance'}
  `

  const coalesceFilterCount = await sql`
    SELECT COUNT(*)::int AS count
    FROM inspections
    WHERE (submitted_at IS NOT NULL OR lower(trim(COALESCE(status, ''))) IN ('submitted', 'completed', 'complete'))
      AND submitted_at >= ${DATE_FROM}::timestamptz
      AND submitted_at <= ${DATE_TO}::timestamptz
      AND trim(coalesce(NULLIF(trim(template_name), ''), NULLIF(trim(type), ''), '')) = ${'Grounds Maintenance'}
  `

  const gmDropdownValue = dropdownOptions.find((r) => /ground/i.test(r.template_name || ''))

  console.log('=== June 2026 submitted inspections (analytics completed scope + date) ===')
  console.log('Total count:', submittedJune[0]?.count)

  console.log('\n=== Distinct template_name / type / template_id in June ===')
  console.table(distinctNames)

  console.log('\n=== Records matching ground/maintenance (template_name OR type) ===')
  console.log('Count:', groundsLike.length)
  if (groundsLike.length) console.table(groundsLike.slice(0, 20))

  console.log('\n=== Dropdown options containing "ground" ===')
  console.log(
    dropdownOptions
      .filter((r) => /ground|maintenance/i.test(r.template_name || ''))
      .map((r) => r.template_name)
  )

  console.log('\n=== Filter simulation: trim(template_name) = "Grounds Maintenance" ===')
  console.log('Count:', exactFilterCount[0]?.count)

  console.log('\n=== Filter simulation: coalesce(template_name, type) label match ===')
  console.log('Count:', coalesceFilterCount[0]?.count)

  if (gmDropdownValue) {
    console.log('\n=== Closest dropdown value for Grounds Maintenance ===')
    console.log(JSON.stringify(gmDropdownValue, null, 2))
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
