import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function tryResolvePath(filePath) {
  const candidates = [filePath, `${filePath}.js`, `${filePath}.mjs`, `${filePath}.cjs`]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export async function resolve(specifier, context, defaultResolve) {
  if (typeof specifier === 'string' && specifier.startsWith('@/')) {
    const basePath = path.join(process.cwd(), specifier.slice(2))
    const resolvedPath = tryResolvePath(basePath)
    if (resolvedPath) {
      return defaultResolve(pathToFileURL(resolvedPath).href, context, defaultResolve)
    }
  }
  return defaultResolve(specifier, context, defaultResolve)
}
