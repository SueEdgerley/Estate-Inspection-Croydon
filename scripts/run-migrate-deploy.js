/**
 * Load DATABASE_URL from .env.production.local and run: npx prisma@6.0.0 migrate deploy
 * Usage: node scripts/run-migrate-deploy.js
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const envFile = path.join(process.cwd(), '.env.production.local')
if (!fs.existsSync(envFile)) {
  console.error('Missing .env.production.local (pull with: npx vercel env pull .env.production.local --environment=production)')
  process.exit(1)
}

const raw = fs.readFileSync(envFile, 'utf8')
for (const line of raw.split(/\r?\n/)) {
  const idx = line.indexOf('=')
  if (idx <= 0) continue
  const key = line.slice(0, idx).trim()
  let value = line.slice(idx + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  if (key === 'DATABASE_URL') {
    process.env.DATABASE_URL = value
    break
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.production.local')
  process.exit(1)
}

execSync('npx prisma@6.0.0 migrate deploy', { stdio: 'inherit', env: process.env })
