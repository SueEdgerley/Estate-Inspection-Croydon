const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .reduce((acc, line) => {
    const [key, ...rest] = line.split('=');
    acc[key.trim()] = rest.join('=');
    return acc;
  }, {});
(async () => {
  try {
    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    console.log('connected');
    const res = await client.query('SELECT 1 as ok');
    console.log('query', res.rows);
    await client.end();
  } catch (err) {
    console.error('ERR', err);
    process.exit(1);
  }
})();
