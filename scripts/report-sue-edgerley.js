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
  const query = `SELECT i.id, i.type, i.status, i.submitted_at, i.created_at, i.inspector_name, i.inspector_id, i.estate_id, i.block_id, e.name AS estate_name, b.name AS block_name, i.location_label, i.title, i.source, i.description
FROM inspections i
LEFT JOIN estates e ON e.id = i.estate_id
LEFT JOIN blocks b ON b.id = i.block_id
WHERE lower(trim(coalesce(i.inspector_name, ''))) LIKE '%sue edgerley%'
   OR lower(trim(coalesce(i.inspector_id, ''))) LIKE '%sue edgerley%'
ORDER BY i.created_at DESC;`;
  const res = await client.query(query);

  const statusLower = (value) => (value || '').trim().toLowerCase();
  const isSubmitted = (row) => row.submitted_at || ['submitted', 'completed', 'complete'].includes(statusLower(row.status));

  const summary = {
    total: res.rowCount,
    submitted: res.rows.filter(isSubmitted).length,
    draft_like: res.rows.filter((row) => !isSubmitted(row)).length,
    candidateIds: res.rows.map((row) => row.id),
    rows: res.rows.slice(0, 120),
  };

  console.log(JSON.stringify(summary, null, 2));
  await client.end();
})();
