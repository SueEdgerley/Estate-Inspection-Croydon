#!/usr/bin/env node
/**
 * Cross-platform build: prisma generate then next build.
 * Avoids reliance on shell && (e.g. PowerShell).
 */
const { execSync } = require('child_process');

function run(cmd, description, options = {}) {
  const { optional = false } = options
  console.log(description || cmd);
  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
  } catch (err) {
    if (optional) {
      console.warn(`[build] Optional step failed: ${description || cmd}`)
      console.warn(`[build] Continuing. Reason: ${err?.message || String(err)}`)
      return false
    }
    process.exit(1);
  }
  return true
}

run('npx prisma generate', 'Running prisma generate...', { optional: true });
run('npx next build', 'Running next build...');
