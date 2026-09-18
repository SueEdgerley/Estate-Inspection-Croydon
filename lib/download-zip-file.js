/**
 * Browser ZIP download helper.
 * Always saves one .zip via <a download> (or Edge msSaveOrOpenBlob).
 * Never sets target, never window.open, never navigates to file URLs.
 */

export function isZipBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  return data.length >= 22 && data[0] === 0x50 && data[1] === 0x4b
}

export function defaultBulkZipFilename(now = new Date()) {
  const date = now.toLocaleDateString('en-GB', { timeZone: 'Europe/London' }).replace(/\//g, '-')
  return `inspection-reports-${date}.zip`
}

export function ensureZipFilename(filename, now = new Date()) {
  const raw = String(filename || '')
    .trim()
    .replace(/[/\\]/g, '-')
  if (raw.toLowerCase().endsWith('.zip')) return raw
  if (raw) return `${raw}.zip`
  return defaultBulkZipFilename(now)
}

export function filenameFromContentDisposition(header) {
  const value = String(header || '')
  const star = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      return star[1].trim()
    }
  }
  const quoted = value.match(/filename\s*=\s*"([^"]+)"/i)
  if (quoted?.[1]) return quoted[1]
  const plain = value.match(/filename\s*=\s*([^;]+)/i)
  return plain?.[1] ? plain[1].trim().replace(/^['"]|['"]$/g, '') : ''
}

export function filenameFromZipResponse(res, now = new Date()) {
  const custom = res?.headers?.get?.('X-Pdf-Zip-Filename')
  const fromDisposition = filenameFromContentDisposition(res?.headers?.get?.('Content-Disposition'))
  return ensureZipFilename(custom || fromDisposition || '', now)
}

/**
 * Trigger exactly one ZIP file download into the browser Downloads folder.
 * @returns {{ filename: string, mimeType: string, method: string, target: string }}
 */
export function triggerZipFileDownload(bytes, filename, env = {}) {
  const name = ensureZipFilename(filename)
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  const blob = new Blob([data], { type: 'application/zip' })
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : undefined)

  if (nav && typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(blob, name)
    return { filename: name, mimeType: 'application/zip', method: 'msSaveOrOpenBlob', target: '' }
  }

  const urlApi = env.URL || globalThis.URL
  const doc = env.document || (typeof document !== 'undefined' ? document : null)
  if (!doc?.createElement || !urlApi?.createObjectURL) {
    throw new Error('ZIP download is not available in this browser.')
  }

  const href = urlApi.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = href
  a.download = name
  a.setAttribute('download', name)
  a.rel = 'noopener'
  a.style.display = 'none'
  // Never open a tab. The old bulk path set target=_blank on each PDF URL.
  a.removeAttribute?.('target')
  a.target = ''

  const parent = doc.body || doc.documentElement
  parent.appendChild(a)
  a.click()
  if (typeof a.remove === 'function') a.remove()
  else parent.removeChild?.(a)

  const revokeDelay = env.revokeDelayMs == null ? 60_000 : env.revokeDelayMs
  const schedule = env.setTimeout || globalThis.setTimeout
  schedule(() => {
    try {
      urlApi.revokeObjectURL(href)
    } catch {
      /* ignore */
    }
  }, revokeDelay)

  return { filename: name, mimeType: blob.type, method: 'anchor-download', target: String(a.target || '') }
}
