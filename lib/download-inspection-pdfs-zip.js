/**
 * Manage Inspections bulk action: one ZIP of selected report PDFs.
 * Does not iterate PDF URLs and must not open tabs.
 */

import {
  defaultBulkZipFilename,
  filenameFromZipResponse,
  isZipBytes,
  triggerZipFileDownload,
} from './download-zip-file.js'

export const INSPECTION_PDFS_ZIP_ENDPOINT = '/api/inspections/report-pdfs-zip'

function headerMessage(res) {
  const encoded = res?.headers?.get?.('X-Pdf-Zip-Message') || ''
  if (!encoded) return ''
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

/**
 * POST selected IDs to the ZIP endpoint and save exactly one .zip file.
 * @returns {Promise<{ ok: boolean, error?: string, included: number, requested: number, message: string, filename?: string }>}
 */
export async function downloadSelectedInspectionPdfsZip(ids, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch.bind(globalThis)
  const triggerDownload = options.triggerDownload || triggerZipFileDownload
  const requestedIds = Array.isArray(ids) ? ids.filter(Boolean) : []

  const res = await fetchImpl(INSPECTION_PDFS_ZIP_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/zip',
    },
    body: JSON.stringify({ ids: requestedIds }),
  })

  const included = Number(res.headers.get('X-Pdf-Zip-Included') || 0)
  const requested = Number(res.headers.get('X-Pdf-Zip-Requested') || requestedIds.length)
  const message = headerMessage(res)

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return {
      ok: false,
      error: data.error || data.details || message || `Could not prepare PDFs (${res.status})`,
      included,
      requested,
      message,
    }
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (!isZipBytes(bytes)) {
    return {
      ok: false,
      error: 'The ZIP file could not be prepared.',
      included,
      requested,
      message,
    }
  }

  const filename = filenameFromZipResponse(res) || defaultBulkZipFilename()
  triggerDownload(bytes, filename, options.downloadEnv)
  return { ok: true, included, requested, message, filename }
}
