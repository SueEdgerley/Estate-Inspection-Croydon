const fs = require('fs');
const { Client } = require('pg');

const env = fs.readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...rest] = line.split('=');
    if (!key) return acc;
    let value = rest.join('=');
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    acc[key.trim()] = value;
    return acc;
  }, {});

const client = new Client({ connectionString: env.DATABASE_URL });

(async () => {
  await client.connect();
  const query = `SELECT i.type, i.status, COUNT(*) AS count
FROM inspections i
WHERE lower(trim(coalesce(i.inspector_name, ''))) LIKE '%sue edgerley%'
   OR lower(trim(coalesce(i.inspector_id, ''))) LIKE '%sue edgerley%'
GROUP BY i.type, i.status
ORDER BY i.type, i.status;`;
  const res = await client.query(query);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})();
