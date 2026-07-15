const { execSync } = require('child_process')
const path = require('path')
const root = path.join(__dirname, '..')

function run(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' })
}

const files = [
  'lib/pdf/buildInspectionReportPdf.js',
  'lib/pdf/photo-grid-metrics.js',
  'lib/pdf/buildIssueJobCardPdf.js',
  'lib/full-inspection-report-pdf.js',
  'scripts/inspection-report-pdf-photos.test.mjs',
  'scripts/esm-alias-hooks.mjs',
  'scripts/esm-alias-register.mjs',
  'scripts/verify-multi-photo-pdf.mjs',
  'scripts/final-verify-multi-photo-pdf.mjs',
]

try {
  console.log('STATUS:\n', run('git status --short'))
  console.log('ADD files...')
  for (const f of files) {
    try {
      run(`git add "${f}"`)
      console.log('  added', f)
    } catch (e) {
      console.log('  skip', f, e.message)
    }
  }
  console.log('STAGED:\n', run('git diff --cached --name-only'))
  run('git commit -m "fix: render all inspection photos in PDF reports"')
  console.log('COMMIT:\n', run('git log -1 --format="%H %s"'))
  console.log('FILES:\n', run('git show --name-only --pretty=format: HEAD'))
  console.log('STATUS AFTER:\n', run('git status --short'))
} catch (e) {
  console.error('FAILED:', e.stdout || e.message)
  process.exit(1)
}
