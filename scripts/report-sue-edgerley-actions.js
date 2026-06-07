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
  const query = `SELECT i.id, i.type, i.status, i.submitted_at, i.created_at, i.inspector_name, i.inspector_id, i.estate_id, i.block_id, e.name AS estate_name, b.name AS block_name, i.location_label, i.title, COUNT(a.id) AS action_count
FROM inspections i
LEFT JOIN estates e ON e.id = i.estate_id
LEFT JOIN blocks b ON b.id = i.block_id
LEFT JOIN actions a ON a.inspection_id = i.id
WHERE lower(trim(coalesce(i.inspector_name, ''))) LIKE '%sue edgerley%'
   OR lower(trim(coalesce(i.inspector_id, ''))) LIKE '%sue edgerley%'
GROUP BY i.id, e.name, b.name
ORDER BY i.created_at DESC;`;
  const res = await client.query(query);

  const rows = res.rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    estate_name: row.estate_name,
    block_name: row.block_name,
    location_label: row.location_label,
    title: row.title,
    action_count: Number(row.action_count),
  }));

  const statusCounts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    total: rows.length,
    statusCounts,
    rows,
  };

  fs.writeFileSync('scripts/report-sue-edgerley-actions.json', JSON.stringify(summary, null, 2), 'utf8');
  await client.end();
})();
