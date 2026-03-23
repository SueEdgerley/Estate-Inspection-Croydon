#!/usr/bin/env node
/**
 * Cross-platform build: prisma generate then next build.
 * Avoids reliance on shell && (e.g. PowerShell).
 */
const { execSync } = require('child_process');

function run(cmd, description) {
  console.log(description || cmd);
  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
  } catch (err) {
    process.exit(1);
  }
}

run('npx prisma generate', 'Running prisma generate...');
run('npx next build', 'Running next build...');
