/**
 * Local harness that mirrors Manage Inspections "Download selected PDFs":
 * selected IDs → ZIP endpoint → one .zip download. No per-PDF tabs.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildZipArchive } from '../lib/zip-store.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 3477)

const zipBytes = buildZipArchive(
  Array.from({ length: 12 }, (_, i) => ({
    name: `Test-Block-${i + 1}-18-09-2026.pdf`,
    bytes: Buffer.from(`%PDF-1.4\n% report ${i + 1}\n%%EOF\n`),
  }))
)
const zipName = 'inspection-reports-18-09-2026.zip'

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Bulk ZIP download harness</title>
</head>
<body>
  <h1>Manage Inspections harness</h1>
  <p>12 inspections selected</p>
  <button type="button" id="download-selected-pdfs">Download selected PDFs</button>
  <pre id="log"></pre>
  <script type="module">
    import { downloadSelectedInspectionPdfsZip } from '/lib/download-inspection-pdfs-zip.js'
    const ids = Array.from({ length: 12 }, (_, i) => 'insp-' + (i + 1))
    window.__opened = []
    window.__downloads = []
    window.__tabCountAtStart = 1
    const originalOpen = window.open
    window.open = function patchedOpen(url, target) {
      window.__opened.push({ url: String(url || ''), target: String(target || '') })
      return originalOpen ? originalOpen.apply(this, arguments) : null
    }
    document.getElementById('download-selected-pdfs').addEventListener('click', async () => {
      const result = await downloadSelectedInspectionPdfsZip(ids, {
        triggerDownload: async (bytes, filename) => {
          window.__downloads.push({
            filename,
            size: bytes.byteLength || bytes.length,
            mimeForced: 'application/zip',
          })
          const { triggerZipFileDownload } = await import('/lib/download-zip-file.js')
          triggerZipFileDownload(bytes, filename)
        },
      })
      window.__zipResult = result
      document.getElementById('log').textContent = JSON.stringify({
        result,
        downloads: window.__downloads,
        opened: window.__opened,
        extraAnchors: [...document.querySelectorAll('a')].map((a) => ({
          href: a.href,
          download: a.download,
          target: a.target,
        })),
      }, null, 2)
    })
  </script>
</body>
</html>`

const mime = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (req.method === 'POST' && url.pathname === '/api/inspections/report-pdfs-zip') {
    const headers = {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Length': String(zipBytes.length),
      'X-Pdf-Zip-Filename': zipName,
      'X-Pdf-Zip-Requested': '12',
      'X-Pdf-Zip-Included': '12',
      'X-Pdf-Zip-Failed': '0',
      'X-Pdf-Zip-Message': encodeURIComponent('12 of 12 reports downloaded.'),
      'Access-Control-Expose-Headers':
        'Content-Disposition, Content-Type, X-Pdf-Zip-Filename, X-Pdf-Zip-Requested, X-Pdf-Zip-Included, X-Pdf-Zip-Failed, X-Pdf-Zip-Message',
    }
    res.writeHead(200, headers)
    res.end(zipBytes)
    return
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/inspections')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/lib/')) {
    const filePath = path.join(root, url.pathname)
    if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'text/plain' })
    res.end(fs.readFileSync(filePath))
    return
  }
  res.writeHead(404)
  res.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`ZIP harness http://127.0.0.1:${port}/`)
})
