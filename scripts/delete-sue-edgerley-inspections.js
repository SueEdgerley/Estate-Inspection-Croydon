const fs = require('fs')
const { Client } = require('pg')
const env = fs.readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...rest] = line.split('=')
    let value = rest.join('=')
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    acc[key.trim()] = value
    return acc
  }, {})

const TARGET_NAME = 'sue edgerley'
const TARGET_EMAIL = 'sue.edgerley@croydon.gov.uk'
const TARGET_ID = '2b883dbc-fcb7-44a3-8685-cecd70bda867'

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

;(async () => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const candidateResult = await client.query(
      `SELECT id FROM inspections
       WHERE lower(trim(coalesce(inspector_name, ''))) = $1
          OR lower(trim(coalesce(inspector_id, ''))) = $2
       ORDER BY id`,
      [TARGET_NAME, TARGET_EMAIL]
    )
    const inspectionIds = candidateResult.rows.map((row) => row.id)
    if (inspectionIds.length === 0) {
      console.log('No matching inspections found; nothing to delete.')
      return
    }

    console.log('Matched inspection ids:', inspectionIds)

    await client.query('BEGIN')

    const actionIdsResult = await client.query(
      `SELECT id FROM actions WHERE inspection_id = ANY($1)`,
      [inspectionIds]
    )
    const actionIds = actionIdsResult.rows.map((row) => row.id)

    if (actionIds.length > 0) {
      await client.query(
        `DELETE FROM action_photos WHERE action_id = ANY($1)`,
        [actionIds]
      )
    }

    await client.query(`DELETE FROM actions WHERE inspection_id = ANY($1)`, [inspectionIds])
    await client.query(`DELETE FROM inspection_photos WHERE inspection_id = ANY($1)`, [inspectionIds])
    await client.query(`DELETE FROM inspection_answers WHERE inspection_id = ANY($1)`, [inspectionIds])
    await client.query(`DELETE FROM inspection_recipients WHERE inspection_id = ANY($1)`, [inspectionIds])
    await client.query(`DELETE FROM inspection_updates WHERE inspection_id = ANY($1)`, [inspectionIds])
    await client.query(`DELETE FROM inspections WHERE id = ANY($1)`, [inspectionIds])

    await client.query('COMMIT')

    const verification = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM inspections WHERE lower(trim(coalesce(inspector_name, ''))) = $1) AS remaining_inspector_name_count,
         (SELECT COUNT(*) FROM inspections WHERE lower(trim(coalesce(inspector_id, ''))) = $2) AS remaining_inspector_id_count,
         (SELECT COUNT(*) FROM actions WHERE inspection_id = ANY($3)) AS remaining_action_count_for_deleted_ids,
         (SELECT EXISTS(SELECT 1 FROM inspections WHERE id = $4)) AS target_id_exists,
         (SELECT COUNT(*)
            FROM inspections
           WHERE (lower(trim(coalesce(inspector_name, ''))) = $1
                  OR lower(trim(coalesce(inspector_id, ''))) = $2)
             AND submitted_at IS NULL
             AND lower(trim(coalesce(status, ''))) NOT IN ('submitted', 'completed', 'complete')
         ) AS remaining_manage_inspections_count`,
      [TARGET_NAME, TARGET_EMAIL, inspectionIds, TARGET_ID]
    )

    console.log(JSON.stringify(verification.rows[0], null, 2))
  } catch (error) {
    console.error('ERROR during deletion:', error)
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('ROLLBACK ERROR:', rollbackError)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
})()
