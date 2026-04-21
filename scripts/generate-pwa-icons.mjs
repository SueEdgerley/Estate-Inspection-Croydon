/**
 * Generates PNG icons for PWA / Add to Home Screen from an inline SVG.
 * Purple LBC house mark — run after editing the SVG below.
 *
 * Run: npm run pwa:icons
 *   or: node scripts/generate-pwa-icons.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'icons')

/** Vibrant purple tile + white house / LBC / CROYDON (matches council PWA brief). */
const svg512 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="42%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#5b21b6"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- House silhouette (white) -->
  <path fill="#ffffff" d="M256 96 L404 244 L404 400 L108 400 L108 244 Z"/>
  <!-- Four-pane attic window -->
  <rect x="232" y="152" width="48" height="44" rx="5" fill="none" stroke="#5b21b6" stroke-width="4"/>
  <line x1="256" y1="152" x2="256" y2="196" stroke="#5b21b6" stroke-width="3"/>
  <line x1="232" y1="174" x2="280" y2="174" stroke="#5b21b6" stroke-width="3"/>
  <!-- LBC -->
  <text x="256" y="318" text-anchor="middle" font-family="Arial Black, Helvetica, Arial, sans-serif" font-size="68" font-weight="700" fill="#ffffff">LBC</text>
  <!-- Arc under house -->
  <path d="M 148 418 Q 256 388 364 418" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
  <!-- CROYDON -->
  <text x="256" y="462" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600" letter-spacing="0.2em" fill="#ffffff">CROYDON</text>
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

  // Maskable: same artwork scaled from centre (~82% safe zone) for Android adaptive icons
  const maskSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bgm" cx="42%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#5b21b6"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgm)"/>
  <g transform="translate(256 256) scale(0.82) translate(-256 -256)">
    <path fill="#ffffff" d="M256 96 L404 244 L404 400 L108 400 L108 244 Z"/>
    <rect x="232" y="152" width="48" height="44" rx="5" fill="none" stroke="#5b21b6" stroke-width="4"/>
    <line x1="256" y1="152" x2="256" y2="196" stroke="#5b21b6" stroke-width="3"/>
    <line x1="232" y1="174" x2="280" y2="174" stroke="#5b21b6" stroke-width="3"/>
    <text x="256" y="318" text-anchor="middle" font-family="Arial Black, Helvetica, Arial, sans-serif" font-size="68" font-weight="700" fill="#ffffff">LBC</text>
    <path d="M 148 418 Q 256 388 364 418" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
    <text x="256" y="462" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600" letter-spacing="0.2em" fill="#ffffff">CROYDON</text>
  </g>
</svg>`
  await sharp(Buffer.from(maskSvg)).resize(512, 512).png().toFile(path.join(outDir, 'icon-512-maskable.png'))
  console.log('Wrote', path.relative(root, path.join(outDir, 'icon-512-maskable.png')))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
