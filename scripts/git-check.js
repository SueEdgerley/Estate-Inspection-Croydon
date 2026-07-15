const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
const out = path.join(root, 'tmp', 'git-check.txt')
let s = ''
try {
  s += 'LOG:\n' + execSync('git log -8 --oneline', { cwd: root, encoding: 'utf8' })
  s += '\nSTATUS:\n' + execSync('git status --short', { cwd: root, encoding: 'utf8' })
  s += '\nDIFF buildInspectionReportPdf:\n' + execSync('git diff HEAD -- lib/pdf/buildInspectionReportPdf.js', { cwd: root, encoding: 'utf8' }).slice(0, 500)
  s += '\nHEAD has drawPhotosInCell:\n' + execSync('git show HEAD:lib/pdf/buildInspectionReportPdf.js', { cwd: root, encoding: 'utf8' }).includes('drawPhotosInCell')
  s += '\nWORKTREE has drawPhotosInCell:\n' + fs.readFileSync(path.join(root, 'lib/pdf/buildInspectionReportPdf.js'), 'utf8').includes('drawPhotosInCell')
} catch (e) {
  s += '\nERR: ' + (e.stdout || e.message)
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, s)
console.log('wrote', out)
