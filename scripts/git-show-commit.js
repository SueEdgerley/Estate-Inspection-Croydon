const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
const out = path.join(root, 'tmp', 'git-commit-info.txt')
let s = ''
s += execSync('git show ec13d8b --stat --format=fuller', { cwd: root, encoding: 'utf8' })
s += '\n---\nFILES:\n'
s += execSync('git show ec13d8b --name-only --pretty=format:', { cwd: root, encoding: 'utf8' })
fs.writeFileSync(out, s)
console.log('done')
