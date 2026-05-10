require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING

const { sql } = require('@vercel/postgres')

const id = process.argv[2]

async function main() {
  const inspection = await sql.query(
    'select id, status, type, source, template_id, template_name, submitted_at, created_at, title, location_label from inspections where id = $1',
    [id]
  )
  const answers = await sql.query(
    'select question_id, section_id, question_type, answer_value, answer_text, answer_boolean, notes from inspection_answers where inspection_id = $1 order by section_id, question_id',
    [id]
  )
  const actions = await sql.query(
    'select id, question_id, category, priority, status, auto_created, created_at, title from actions where inspection_id = $1 order by created_at',
    [id]
  )
  const yesAnswers = answers.rows.filter((row) => {
    const value = row.answer_value ?? row.answer_text ?? row.answer_boolean ?? ''
    return String(value).toLowerCase().trim() === 'yes' || row.answer_boolean === true
  })
  console.log(JSON.stringify({
    inspection: inspection.rows[0] || null,
    answer_count: answers.rows.length,
    yes_answer_count: yesAnswers.length,
    yes_answers: yesAnswers,
    action_count: actions.rows.length,
    actions: actions.rows,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
