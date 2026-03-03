#!/usr/bin/env node
/**
 * Verify tables exist in schema public (especially users).
 * Run after: npx prisma migrate deploy
 * Requires: DATABASE_URL in env or .env
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Set it to your Postgres connection string.');
    process.exit(1);
  }

  const tables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  console.log('Tables in schema public:');
  tables.forEach((r) => console.log('  -', r.table_name));

  const hasUsers = tables.some((r) => r.table_name === 'users');
  if (hasUsers) {
    console.log('\n✓ users table exists. You can retry login/dashboard.');
  } else {
    console.log('\n✗ users table missing. Run: npx prisma migrate deploy');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Verify failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
