#!/usr/bin/env node
/**
 * If migrate deploy is blocked (e.g. P3005): baseline existing DB by marking
 * each migration in prisma/migrations as applied, then run prisma migrate deploy.
 *
 * Usage: npm run db:baseline   (or node scripts/baseline-and-migrate.js)
 * Requires: DATABASE_URL set.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
const migrationFolders = entries
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

if (migrationFolders.length === 0) {
  console.log('No migration folders found in prisma/migrations');
  process.exit(0);
}

console.log('Baseline: mark as applied then deploy.\n');
for (const name of migrationFolders) {
  console.log(`  prisma migrate resolve --applied "${name}"`);
  execSync(`npx prisma migrate resolve --applied "${name}"`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
}
console.log('\nRunning prisma migrate deploy...\n');
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});
console.log('\nDone. Run npm run db:verify to confirm tables (e.g. users).');
