import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveAtImport(specifier) {
  const rel = specifier.slice(2) // strip @/
  const candidates = [
    path.join(root, rel),
    path.join(root, `${rel}.js`),
    path.join(root, `${rel}.jsx`),
    path.join(root, `${rel}.mjs`),
    path.join(root, rel, 'index.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href
  }
  // Default to .js for Next-style extensionless imports
  return pathToFileURL(path.join(root, `${rel}.js`)).href
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(resolveAtImport(specifier), context)
  }
  // Also fix relative extensionless imports that Next allows
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !path.extname(specifier) &&
    context.parentURL
  ) {
    try {
      const parentPath = fileURLToPath(context.parentURL)
      const base = path.resolve(path.dirname(parentPath), specifier)
      const candidates = [`${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, 'index.js')]
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context)
        }
      }
    } catch {
      // fall through
    }
  }
  return nextResolve(specifier, context)
}
