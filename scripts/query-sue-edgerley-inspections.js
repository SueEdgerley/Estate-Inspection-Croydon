const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...rest] = line.split('=');
    let value = rest.join('=');
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    acc[key.trim()] = value;
    return acc;
  }, {});

(async () => {
  try {
    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    const query = `
      SELECT id, type, template_name, source, status, submitted_at, created_at, updated_at,
             inspector_name, inspector_id, estate_id, block_id
      FROM inspections
      WHERE lower(trim(coalesce(inspector_name, ''))) LIKE '%sue edgerley%'
         OR lower(trim(coalesce(inspector_id, ''))) LIKE '%sue edgerley%'
      ORDER BY created_at DESC
    `;
    const res = await client.query(query);
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
  } catch (error) {
    console.error('ERROR', error);
    process.exit(1);
  }
})();
