/**
 * Generate Homestead-style issue job card PDF, upload to Blob, persist issue_pdf_url.
 * Failures are swallowed so inspection submit / action insert never depends on Blob/PDF.
 */

import { buildIssueJobCardPdfBuffer } from '@/lib/pdf/buildIssueJobCardPdf'
import { uploadInspectionPdfToBlob } from '@/lib/blob/uploadPdf'

/** @param {unknown} raw */
export function parsePhotoUrlsColumn(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string' && u.trim())
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.filter((u) => typeof u === 'string' && u.trim()) : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * @param {import('@vercel/postgres').Sql} sql
 * @param {string | null | undefined} personId
 */
export async function formatAssignedTeamLabel(sql, personId) {
  const pid = personId != null ? String(personId).trim() : ''
  if (!pid) return '—'
  try {
    const r = await sql`
      SELECT name, email FROM people
      WHERE id = ${pid} AND COALESCE(active, true) = true
      LIMIT 1
    `
    const p = r.rows[0]
    if (!p) return pid
    const parts = [p.name, p.email].filter(Boolean)
    return parts.join(parts.length > 1 ? ' — ' : '') || pid
  } catch {
    return pid
  }
}

/**
 * @param {import('@vercel/postgres').Sql} sql
 * @param {Record<string, unknown>} p
 */
export async function tryGenerateAndStoreIssueJobCardPdf(sql, p) {
  const {
    actionId,
    inspectionId,
    inspectionType = 'Inspection',
    blockEstate = '',
    location = '',
    dateRaised = '',
    issueTitle = '',
    issueDetail = '',
    assignedTeam = '—',
    status = 'Open',
    photoUrls = [],
  } = p

  if (!actionId || !inspectionId) return { ok: false, error: 'missing_ids' }

  try {
    const pdfBuffer = await buildIssueJobCardPdfBuffer({
      actionId,
      inspectionType,
      blockEstate,
      location,
      dateRaised,
      issueTitle,
      issueDetail,
      assignedTeam,
      status,
      photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
    })

    const url = await uploadInspectionPdfToBlob({
      inspectionId,
      actionId,
      pdfBytes: new Uint8Array(pdfBuffer),
      kind: 'issue',
    })

    await sql`
      UPDATE actions SET issue_pdf_url = ${url}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${actionId}
    `
    return { ok: true, url }
  } catch (e) {
    console.error('[issue-job-card] generate/upload failed:', actionId, e)
    return { ok: false, error: e?.message || String(e) }
  }
}
