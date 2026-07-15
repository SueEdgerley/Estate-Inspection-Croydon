/**
 * Resolve `@/` imports to the project root for Node ESM scripts.
 * Usage: node --import ./scripts/esm-alias-register.mjs scripts/verify-multi-photo-pdf.mjs
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

register('./esm-alias-hooks.mjs', pathToFileURL(path.join(root, 'scripts/')))
