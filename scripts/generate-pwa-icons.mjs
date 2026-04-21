/**
 * Generates PNG icons for PWA / home screen from an inline SVG.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'icons')

const THEME = '#1E3A8A'
const ACCENT = '#ffffff'

/** Simple square mark: matches app “council / housing” tooling feel without embedding external assets. */
const svg512 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${THEME}" rx="96"/>
  <g fill="${ACCENT}" transform="translate(96,96)">
    <rect x="0" y="160" width="320" height="48" rx="8"/>
    <rect x="0" y="80" width="200" height="48" rx="8"/>
    <rect x="0" y="0" width="320" height="48" rx="8"/>
    <path d="M280 240 L320 320 L240 320 Z" opacity="0.95"/>
  </g>
</svg>`

async function main() {
  await fs.promises.mkdir(outDir, { recursive: true })
  const buf = Buffer.from(svg512)

  const sizes = [
    [192, 'icon-192.png'],
    [512, 'icon-512.png'],
    [180, 'apple-touch-icon.png'],
  ]

  for (const [size, name] of sizes) {
    const out = path.join(outDir, name)
    await sharp(buf).resize(size, size).png().toFile(out)
    console.log('Wrote', path.relative(root, out))
  }

  // Maskable: same art with padding inside safe zone (inner 80% content)
  const maskSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${THEME}" rx="112"/>
  <g fill="${ACCENT}" transform="translate(128,128) scale(0.5)">
    <rect x="0" y="160" width="320" height="48" rx="8"/>
    <rect x="0" y="80" width="200" height="48" rx="8"/>
    <rect x="0" y="0" width="320" height="48" rx="8"/>
    <path d="M280 240 L320 320 L240 320 Z" opacity="0.95"/>
  </g>
</svg>`
  await sharp(Buffer.from(maskSvg)).resize(512, 512).png().toFile(path.join(outDir, 'icon-512-maskable.png'))
  console.log('Wrote', path.relative(root, path.join(outDir, 'icon-512-maskable.png')))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
