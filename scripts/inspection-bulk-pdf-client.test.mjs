/**
 * Client bulk PDF path: one ZIP download, never per-PDF tabs.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/inspection-bulk-pdf-client.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadSelectedInspectionPdfsZip, INSPECTION_PDFS_ZIP_ENDPOINT } from '../lib/download-inspection-pdfs-zip.js'
import {
  filenameFromContentDisposition,
  isZipBytes,
  triggerZipFileDownload,
} from '../lib/download-zip-file.js'
import { buildZipArchive, countZipEntries } from '../lib/zip-store.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fakeDocument() {
  const clicks = []
  const created = []
  const document = {
    body: {
      appendChild(el) {
        created.push(el)
        return el
      },
      removeChild(el) {
        return el
      },
    },
    createElement(tag) {
      const el = {
        tagName: tag,
        href: '',
        download: '',
        target: '_blank',
        rel: '',
        style: {},
        setAttribute(name, value) {
          this[name] = value
        },
        removeAttribute(name) {
          this[name] = ''
        },
        click() {
          clicks.push({
            href: this.href,
            download: this.download,
            target: this.target,
            rel: this.rel,
          })
        },
        remove() {},
      }
      return el
    },
  }
  return { document, clicks, created }
}

describe('ZIP filename / magic', () => {
  it('reads the attachment filename from Content-Disposition', () => {
    assert.equal(
      filenameFromContentDisposition(
        'attachment; filename="inspection-reports-18-09-2026.zip"; filename*=UTF-8\'\'inspection-reports-18-09-2026.zip'
      ),
      'inspection-reports-18-09-2026.zip'
    )
  })

  it('accepts PK ZIP bytes and rejects a raw PDF', () => {
    const zip = buildZipArchive([{ name: 'one.pdf', bytes: Buffer.from('%PDF-1.4 x') }])
    assert.equal(isZipBytes(zip), true)
    assert.equal(isZipBytes(Buffer.from('%PDF-1.4 not a zip')), false)
  })
})

describe('triggerZipFileDownload', () => {
  it('creates exactly one application/zip download with no target tab', () => {
    const zip = buildZipArchive([{ name: 'one.pdf', bytes: Buffer.from('%PDF-1.4 x') }])
    const { document, clicks } = fakeDocument()
    const objectUrls = []
    const result = triggerZipFileDownload(zip, 'inspection-reports-18-09-2026.zip', {
      document,
      URL: {
        createObjectURL(blob) {
          assert.equal(blob.type, 'application/zip')
          objectUrls.push(blob)
          return 'blob:zip-test'
        },
        revokeObjectURL() {},
      },
      setTimeout: (fn) => fn(),
    })
    assert.equal(clicks.length, 1)
    assert.equal(clicks[0].download, 'inspection-reports-18-09-2026.zip')
    assert.equal(clicks[0].target, '')
    assert.equal(clicks[0].href, 'blob:zip-test')
    assert.equal(result.mimeType, 'application/zip')
    assert.equal(objectUrls.length, 1)
  })
})

describe('downloadSelectedInspectionPdfsZip', () => {
  it('POSTs selected IDs once to the ZIP endpoint and downloads one ZIP of 12 PDFs', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `insp-${i + 1}`)
    const zip = buildZipArchive(
      ids.map((id, index) => ({
        name: `Block-${index + 1}-18-09-2026.pdf`,
        bytes: Buffer.from(`%PDF-1.4 ${id}`),
      }))
    )
    const fetches = []
    const downloads = []
    const fetchImpl = async (url, init) => {
      fetches.push({ url, method: init.method, body: JSON.parse(init.body) })
      return new Response(zip, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="inspection-reports-18-09-2026.zip"',
          'X-Pdf-Zip-Included': '12',
          'X-Pdf-Zip-Requested': '12',
          'X-Pdf-Zip-Filename': 'inspection-reports-18-09-2026.zip',
        },
      })
    }

    const result = await downloadSelectedInspectionPdfsZip(ids, {
      fetch: fetchImpl,
      triggerDownload: (bytes, filename) => {
        downloads.push({ bytes, filename })
      },
    })

    assert.equal(fetches.length, 1)
    assert.equal(fetches[0].url, INSPECTION_PDFS_ZIP_ENDPOINT)
    assert.equal(fetches[0].method, 'POST')
    assert.deepEqual(fetches[0].body.ids, ids)
    assert.equal(downloads.length, 1)
    assert.equal(downloads[0].filename, 'inspection-reports-18-09-2026.zip')
    assert.equal(countZipEntries(downloads[0].bytes), 12)
    assert.equal(result.ok, true)
    assert.equal(result.included, 12)
  })

  it('does not download when the response is a raw PDF instead of a ZIP', async () => {
    const downloads = []
    const result = await downloadSelectedInspectionPdfsZip(['insp-1'], {
      fetch: async () =>
        new Response(Buffer.from('%PDF-1.4 one-report'), {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      triggerDownload: (bytes, filename) => downloads.push({ bytes, filename }),
    })
    assert.equal(result.ok, false)
    assert.equal(downloads.length, 0)
  })
})

describe('Manage Inspections bulk button source', () => {
  it('calls the ZIP helper and does not keep the old per-PDF tab loop', () => {
    const src = fs.readFileSync(path.join(root, 'app/inspections/page.jsx'), 'utf8')
    const handler = src.slice(src.indexOf('const handleDownloadPdf'), src.indexOf('const handleExportCsv'))
    assert.match(handler, /downloadSelectedInspectionPdfsZip\(ids\)/)
    assert.doesNotMatch(handler, /window\.open/)
    assert.doesNotMatch(handler, /target\s*=\s*['"]_blank['"]/)
    assert.doesNotMatch(handler, /\/api\/inspections\/\$\{/)
    assert.doesNotMatch(handler, /getInspectionFullReportPdfUrl/)
    assert.match(src, /Download selected PDFs/)
  })
})
