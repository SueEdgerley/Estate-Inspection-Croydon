const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...rest] = line.split('=');
    let value = rest.join('=');
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    acc[key.trim()] = value;
    return acc;
  }, {});

const client = new Client({ connectionString: env.DATABASE_URL });
(async () => {
  try {
    await client.connect();
    const query = `
      SELECT id, type, template_name, source, status, inspector_name, inspector_id, created_at, updated_at
      FROM inspections
      WHERE id LIKE 'repair_inspection_%'
        AND (lower(trim(coalesce(inspector_name, ''))) LIKE '%sue edgerley%'
             OR lower(trim(coalesce(inspector_id, ''))) LIKE '%sue edgerley%')
      ORDER BY created_at NULLS LAST, id
    `;
    const res = await client.query(query);
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
  } catch (error) {
    console.error('ERROR', error);
    process.exit(1);
  }
})();
