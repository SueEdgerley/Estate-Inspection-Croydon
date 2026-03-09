#!/usr/bin/env node
/**
 * Run Prisma migrations then verify tables (e.g. for production).
 * Usage: DATABASE_URL="postgresql://..." node scripts/migrate-and-verify.js
 * Or:    npm run db:migrate:prod   (with DATABASE_URL in .env or environment)
 */
const { execSync } = require('child_process');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Set it to your Neon/production connection string.');
  process.exit(1);
}

console.log('Running: npx prisma migrate deploy');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', shell: true });
} catch (err) {
  process.exit(1);
}

console.log('\nVerifying tables...');
try {
  execSync('node scripts/verify-tables.js', { stdio: 'inherit', shell: true });
} catch (err) {
  process.exit(1);
}
