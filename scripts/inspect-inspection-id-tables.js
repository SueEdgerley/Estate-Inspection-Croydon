const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...rest] = line.split('=');
    if (!key) return acc;
    acc[key.trim()] = rest.join('=');
    return acc;
  }, {});

const client = new Client({ connectionString: env.DATABASE_URL });
(async () => {
  await client.connect();
  const query = `SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE column_name ILIKE '%inspection_id%'
ORDER BY table_schema, table_name`; 
  const res = await client.query(query);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})().catch((error) => {
  console.error('ERROR', error);
  process.exit(1);
});
