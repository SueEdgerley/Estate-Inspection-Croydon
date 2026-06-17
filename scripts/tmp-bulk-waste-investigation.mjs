// READ-ONLY investigation: Walkabout action email routing (bulk waste + all categories).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from '@vercel/postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.join(rootDir, envFile)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    const value = rest.join('=').replace(/^['"]|['"]$/g, '')
    if (key && value && process.env[key] === undefined) process.env[key] = value
  }
}

function show(label, rows) {
  console.log(`\n===== ${label} (${rows.length} rows) =====`)
  for (const r of rows) console.log(JSON.stringify(r))
}

async function main() {
  const rules = await sql`
    SELECT id, issue_category, issue_type, estate_id, assign_to_role, assign_to_person_id, email_required, active, created_at
    FROM issue_routing_rules
    ORDER BY issue_category, estate_id NULLS FIRST
  `
  show('issue_routing_rules (all)', rules.rows)

  const actions = await sql`
    SELECT a.id, a.inspection_id, a.question_id, a.category, a.title, a.status,
           a.recipient_person_id, p.name AS recipient_name, p.email AS recipient_email,
           a.created_at
    FROM actions a
    LEFT JOIN people p ON p.id = a.recipient_person_id
    WHERE a.question_id LIKE 'ew_%' OR a.category ILIKE '%walkabout%' OR a.title ILIKE '%bulk%'
    ORDER BY a.created_at DESC
    LIMIT 40
  `
  show('walkabout/bulk actions (recent 40)', actions.rows)

  const inspIds = [...new Set(actions.rows.map((r) => r.inspection_id).filter(Boolean))].slice(0, 12)
  for (const id of inspIds) {
    try {
      const emails = await sql`
        SELECT question_id, email_to, email_routing, status, sent_at
        FROM outbound_emails
        WHERE inspection_id = ${id}
        ORDER BY sent_at ASC NULLS LAST
      `
      show(`outbound_emails for inspection ${id}`, emails.rows)
    } catch (e) {
      console.log(`outbound_emails failed for ${id}:`, e?.message)
      break
    }
  }

  const officers = await sql`
    SELECT id, name, email, role, job_title, active, created_at
    FROM people
    WHERE COALESCE(active, true) = true
      AND email IS NOT NULL AND trim(email) <> ''
      AND (
        lower(COALESCE(job_title, role, '')) LIKE '%housing%officer%'
        OR lower(COALESCE(job_title, role, '')) LIKE '%repairs%officer%'
        OR lower(COALESCE(job_title, role, '')) LIKE '%repair%'
      )
    ORDER BY name
  `
  show('people matching findWalkaboutRepairRecipients query', officers.rows)

  const natalia = await sql`
    SELECT id, name, email, role, job_title, category, active
    FROM people
    WHERE name ILIKE '%natalia%' OR email ILIKE '%natalia%'
  `
  show('people named Natalia', natalia.rows)

  const shared = await sql`
    SELECT id, name, email, role, job_title, category, active
    FROM people
    WHERE lower(email) IN ('housingestateservices@croydon.gov.uk', 'nick.spenceley@croydon.gov.uk')
  `
  show('people rows: shared mailbox / Nick Spenceley', shared.rows)

  try {
    const recentWalkaboutEmailLog = await sql`
      SELECT inspection_id, question_id, email_to, email_routing, status, sent_at
      FROM outbound_emails
      WHERE email_routing ILIKE 'estate_walkabout%'
      ORDER BY sent_at DESC NULLS LAST
      LIMIT 60
    `
    show('outbound_emails routing estate_walkabout* (recent 60)', recentWalkaboutEmailLog.rows)
  } catch (e) {
    console.log('walkabout email log query failed:', e?.message)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e)
    process.exit(1)
  })
