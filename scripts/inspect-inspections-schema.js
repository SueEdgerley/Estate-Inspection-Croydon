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

;(async () => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inspections'
      ORDER BY ordinal_position
    `)
    console.log('INSPECTIONS COLUMNS:')
    console.log(columns.rows)

    const tables = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'inspection_id'
      ORDER BY table_name
    `)
    console.log('TABLES WITH inspection_id:')
    console.log(tables.rows)

    const extraCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('inspections', 'actions')
        AND column_name IN ('created_by', 'submitted_by')
    `)
    console.log('created_by/submitted_by in inspections/actions:')
    console.log(extraCols.rows)
  } catch (err) {
    console.error(err)
    process.exit(1)
  } finally {
    await client.end()
  }
})()
