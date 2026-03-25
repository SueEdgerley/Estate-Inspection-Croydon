const fs = require('fs')
const path = require('path')
const { sql } = require('@vercel/postgres')

function loadEnvFromLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function firstQuestionText(snapshot) {
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : []
  const firstSection = sections[0] || {}
  const questions = Array.isArray(firstSection.questions) ? firstSection.questions : []
  const firstQuestion = questions[0] || {}
  return firstQuestion.question_text || firstQuestion.label || null
}

function summarizeSnapshot(snapshot) {
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : []
  const questionCount = sections.reduce((acc, sec) => {
    const qs = Array.isArray(sec?.questions) ? sec.questions.length : 0
    return acc + qs
  }, 0)
  return {
    template_id: snapshot?.id ?? null,
    template_name: snapshot?.name ?? null,
    sections_count: sections.length,
    questions_count: questionCount,
    first_question_text: firstQuestionText(snapshot),
  }
}

function diffTopLevelQuestionFields(oldSnapshot, newSnapshot) {
  const oldQ = (((oldSnapshot || {}).sections || [])[0] || {}).questions?.[0] || {}
  const newQ = (((newSnapshot || {}).sections || [])[0] || {}).questions?.[0] || {}
  const keys = new Set([...Object.keys(oldQ), ...Object.keys(newQ)])
  const diffs = []
  for (const key of keys) {
    const oldVal = oldQ[key]
    const newVal = newQ[key]
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ field: key, old: oldVal ?? null, new: newVal ?? null })
    }
  }
  return diffs
}

async function main() {
  loadEnvFromLocal()

  const columns = await sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('template_versions', 'inspections')
      AND (
        table_name = 'template_versions'
        OR column_name IN ('template_version_id', 'template_version', 'template_id')
      )
    ORDER BY table_name, ordinal_position
  `

  const pair = await sql`
    WITH ranked AS (
      SELECT
        template_id,
        id,
        created_at,
        version_hash,
        ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY created_at ASC, id ASC) AS rn_old,
        ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY created_at DESC, id DESC) AS rn_new,
        COUNT(*) OVER (PARTITION BY template_id) AS cnt
      FROM template_versions
    )
    SELECT
      template_id,
      MAX(CASE WHEN rn_old = 1 THEN id END) AS old_version_id,
      MAX(CASE WHEN rn_new = 1 THEN id END) AS new_version_id
    FROM ranked
    WHERE cnt >= 2
    GROUP BY template_id
    LIMIT 1
  `

  const result = {
    table_fields: columns.rows,
    template_pair: null,
    old_snapshot_example: null,
    new_snapshot_example: null,
    old_inspection: null,
    new_inspection: null,
    snapshot_diff: [],
    render_proof: null,
  }

  if (!pair.rows[0]) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const { template_id, old_version_id, new_version_id } = pair.rows[0]
  result.template_pair = { template_id, old_version_id, new_version_id }

  const snapshots = await sql`
    SELECT id, template_id, template_name, version_hash, created_at, snapshot
    FROM template_versions
    WHERE id IN (${old_version_id}, ${new_version_id})
    ORDER BY created_at ASC, id ASC
  `
  const oldSnapshotRow = snapshots.rows[0]
  const newSnapshotRow = snapshots.rows[1]
  result.old_snapshot_example = oldSnapshotRow
  result.new_snapshot_example = newSnapshotRow
  result.snapshot_diff = diffTopLevelQuestionFields(oldSnapshotRow?.snapshot, newSnapshotRow?.snapshot)

  const inspections = await sql`
    SELECT id, template_id, template_version_id, created_at, template_version
    FROM inspections
    WHERE template_id = ${template_id}
      AND template_version_id IN (${old_version_id}, ${new_version_id})
    ORDER BY created_at ASC
  `
  result.old_inspection = inspections.rows.find((r) => r.template_version_id === old_version_id) || null
  result.new_inspection = inspections.rows.find((r) => r.template_version_id === new_version_id) || null

  if (result.old_inspection && oldSnapshotRow) {
    const inspectionQuestionText = firstQuestionText(result.old_inspection.template_version)
    const oldSnapshotQuestionText = firstQuestionText(oldSnapshotRow.snapshot)
    const newSnapshotQuestionText = firstQuestionText(newSnapshotRow?.snapshot)
    result.render_proof = {
      inspection_id: result.old_inspection.id,
      inspection_template_version_id: result.old_inspection.template_version_id,
      inspection_snapshot_summary: summarizeSnapshot(result.old_inspection.template_version),
      old_template_version_summary: summarizeSnapshot(oldSnapshotRow.snapshot),
      new_template_version_summary: summarizeSnapshot(newSnapshotRow?.snapshot || {}),
      inspection_question_text: inspectionQuestionText,
      old_snapshot_question_text: oldSnapshotQuestionText,
      new_snapshot_question_text: newSnapshotQuestionText,
      uses_old_snapshot: inspectionQuestionText === oldSnapshotQuestionText,
      differs_from_new_snapshot:
        newSnapshotQuestionText != null ? inspectionQuestionText !== newSnapshotQuestionText : null,
    }
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }, null, 2))
  process.exit(1)
})
