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

(async () => {
  try {
    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    const res = await client.query(`
      SELECT count(*) AS count,
        array_agg(DISTINCT type) AS types,
        array_agg(DISTINCT template_name) AS template_names
      FROM inspections
      WHERE id LIKE 'repair_inspection_%'
    `);
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
  } catch (error) {
    console.error('ERROR', error);
    process.exit(1);
  }
})();
