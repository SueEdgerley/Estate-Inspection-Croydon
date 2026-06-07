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

const quote = (value) => {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
};

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
  const rows = res.rows.map((row) => [
    row.id,
    row.type,
    row.status,
    row.submitted_at,
    row.created_at,
    row.inspector_name,
    row.inspector_id,
    row.estate_name,
    row.block_name,
    row.location_label,
    row.title,
    row.source,
    row.description,
  ]);

  const header = [
    'id', 'type', 'status', 'submitted_at', 'created_at', 'inspector_name', 'inspector_id', 'estate_name', 'block_name', 'location_label', 'title', 'source', 'description',
  ];
  const csv = [header.map(quote).join(','), ...rows.map((row) => row.map(quote).join(','))].join('\n');
  fs.writeFileSync('scripts/report-sue-edgerley-report.csv', csv, 'utf8');
  console.log(`Wrote ${res.rowCount} rows to scripts/report-sue-edgerley-report.csv`);
  await client.end();
})();
