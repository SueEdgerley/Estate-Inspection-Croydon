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
    const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='inspections' ORDER BY ordinal_position");
    console.log(res.rows.map((r) => r.column_name).join(', '));
    await client.end();
  } catch (error) {
    console.error('ERROR', error);
    process.exit(1);
  }
})();
