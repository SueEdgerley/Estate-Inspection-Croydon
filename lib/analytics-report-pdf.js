/**
 * Manager analytics summary PDF (same data shape as GET /api/analytics).
 * Server-only (pdfkit). Uses ASCII-safe text for standard fonts (no inspection PDF / Blob URLs).
 */

import PDFDocument from 'pdfkit'

/** PDF built-in fonts only support limited encodings; strip/replace common Unicode for Vercel/pdfkit reliability. */
export function pdfSafeText(val) {
  return String(val ?? '')
    .replace(/\u2014/g, '-') // em dash
    .replace(/\u2013/g, '-') // en dash
    .replace(/\u00b7/g, '.') // middle dot
    .replace(/\u2215|\u00f7/g, '/') // division-like
    .replace(/\u2588/g, '#') // block → #
    .replace(/[^\n\r\x20-\x7E]/g, '?')
}

function monthLabel(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return pdfSafeText(iso)
  return pdfSafeText(d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))
}

/**
 * @param {object} data - body from loadAnalyticsPayload
 * @returns {Promise<Buffer>}
 */
export function buildAnalyticsReportPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
          Title: 'Estate inspection analytics report',
          Author: 'Estate Inspection - Croydon',
        },
      })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const primary = '#581c87'
      const accent = '#9333ea'
      const muted = '#6b7280'

      doc.font('Helvetica-Bold').fontSize(20).fillColor(primary).text('Estate inspection analytics', { align: 'center' })
      doc.moveDown(0.35)
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(muted)
        .text(
          pdfSafeText(new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })),
          { align: 'center' }
        )
      doc.moveDown(1.2)

      const ov = data?.overview
      if (ov) {
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text('Headline summary')
        doc.moveDown(0.45)
        doc.font('Helvetica').fontSize(10.5).fillColor('#374151')
        doc.text(
          `Overall score (A-D average): ${ov.overallScore != null ? `${Number(ov.overallScore).toFixed(2)} / 4` : '-'}`
        )
        doc.text(`Completed inspections (submitted): ${ov.completedInspections ?? ov.totalInspections ?? '-'}`)
        doc.text(
          `Scheduled total: ${ov.scheduledTotal ?? '-'} | Completed (scheduled): ${ov.scheduledCompleted ?? '-'} | Missed: ${ov.scheduledMissed ?? '-'}`
        )
        doc.text(`Ad hoc (not scheduled): ${ov.adhocTotal ?? '-'} | Ad hoc submitted: ${ov.adhocCompleted ?? '-'}`)
        doc.text(
          `Completion rate (completed / scheduled): ${ov.completionRatePct != null ? `${ov.completionRatePct}%` : '-'}`
        )
        if (ov.completionBasis) {
          doc.fontSize(9).fillColor(muted).text(`Note: ${pdfSafeText(ov.completionBasis)}`)
        }
        const cats = data?.issues?.categories || []
        const topCatStr =
          cats.length > 0
            ? cats
                .slice(0, 5)
                .map((c) => `${pdfSafeText(c.category)} (${c.cnt})`)
                .join('; ')
            : 'None in this period'
        doc.fontSize(10.5).fillColor('#374151').text(`Top issue categories: ${topCatStr}`)
        doc.moveDown(0.35)
        doc.fontSize(9.5).fillColor('#4b5563').text(pdfSafeText(ov.trend?.label || ''), { lineGap: 2 })
        doc.moveDown(1)
      }

      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text('Average score by estate')
      doc.moveDown(0.35)
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(muted)
        .text('Higher values indicate better average letter grades (scale 1-4).')
      doc.moveDown(0.45)

      const estates = (data?.estates || []).slice(0, 15)
      if (estates.length === 0) {
        doc.fontSize(10).fillColor('#6b7280').text('No estate breakdown for the current filters.')
      } else {
        const maxScore = Math.max(0.01, ...estates.map((e) => Number(e.avg_grade) || 0))
        estates.forEach((e) => {
          const name = pdfSafeText(String(e.estate_name || '-').slice(0, 48))
          const score = Number(e.avg_grade)
          const frac = Number.isFinite(score) ? Math.min(1, score / 4) : 0
          const barLen = Math.max(1, Math.round(frac * 36))
          const bar = '#'.repeat(barLen)
          doc.fontSize(9.5).fillColor('#111827').text(`${name}`, { continued: true })
          doc.fillColor(accent).text(`  ${bar}`, { continued: true })
          doc.fillColor('#374151').text(
            `  ${Number.isFinite(score) ? score.toFixed(2) : '-'}  (${e.inspection_count ?? 0} inspections)`
          )
          doc.moveDown(0.25)
        })
      }

      doc.moveDown(0.9)
      if (doc.y > doc.page.height - 180) doc.addPage()

      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text('Score and volume over time')
      doc.moveDown(0.35)
      doc.font('Helvetica').fontSize(9).fillColor(muted).text('Monthly averages (submitted inspections in scope).')
      doc.moveDown(0.45)

      const monthly = data?.trends?.scoresByMonth || []
      if (monthly.length === 0) {
        doc.fontSize(10).fillColor('#6b7280').text('No monthly data for the current filters.')
      } else {
        const maxV = Math.max(1, ...monthly.map((m) => Number(m.inspection_count) || 0))
        monthly.forEach((m) => {
          const n = Number(m.inspection_count) || 0
          const avg = m.avg_grade != null ? Number(m.avg_grade).toFixed(2) : '-'
          const barLen = Math.max(1, Math.round((n / maxV) * 28))
          const bar = '#'.repeat(barLen)
          doc.fontSize(9).fillColor('#111827').text(`${monthLabel(m.month_start)}`, { width: 100, continued: true })
          doc.text(`  avg ${avg}`, { width: 70, continued: true })
          doc.fillColor(accent).text(`  ${bar}`, { continued: true })
          doc.fillColor('#374151').text(`  ${n} inspections`)
          doc.moveDown(0.3)
        })
      }

      doc.moveDown(0.8)
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#9ca3af')
        .text(
          'Manager summary from analytics filters only (not tied to per-inspection full PDF URLs). For operational lists, use Dashboard where available.',
          { align: 'left' }
        )

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}
