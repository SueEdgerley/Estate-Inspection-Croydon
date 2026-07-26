import { ESTATE_WALKABOUT_CHECKLIST_QID } from '@/lib/estate-walkabout-template'
import { normalizeYesNoAnswer } from '@/lib/issue-trigger-answer'
import { formatDateGb } from '@/lib/issue-job-card-upload'
import { croydonLogoEmailHeaderHtml } from '@/lib/logo-branding'
import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'
import { getActivePersonName } from '@/lib/resolve-person-display-name'

export const WALKABOUT_BULK_REFUSE_QID = 'ew_it_bulk_refuse_removal'
export const WALKABOUT_BULK_REFUSE_EMAIL = 'Nick.spenceley@croydon.gov.uk'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getAppBaseUrl(request) {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (explicit && String(explicit).trim()) return String(explicit).trim().replace(/\/$/, '')
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl && String(vercelUrl).trim()) return `https://${String(vercelUrl).trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return new URL(request.url).origin.replace(/\/$/, '')
}

function collectPhotoUrlsFromExtras(extras) {
  if (!extras || typeof extras !== 'object') return []
  const urls = Array.isArray(extras.photo_urls)
    ? extras.photo_urls
    : Array.isArray(extras.photoUrls)
      ? extras.photoUrls
      : []
  const singleUrl = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
  return [...(singleUrl ? [singleUrl] : []), ...urls].filter((url) => typeof url === 'string' && url.trim())
}

function collectBulkRefusePhotoUrls({ answerExtras = {}, answers = {} }) {
  const direct = collectPhotoUrlsFromExtras(answerExtras[WALKABOUT_BULK_REFUSE_QID])
  const checklist = (() => {
    try {
      const parsed = JSON.parse(String(answers[ESTATE_WALKABOUT_CHECKLIST_QID] || '[]'))
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((item) => /bulk\s+refuse/i.test(`${item?.description || ''} ${item?.action_summary || ''}`))
        .flatMap((item) => (Array.isArray(item?.photo_urls) ? item.photo_urls : []))
        .filter((url) => typeof url === 'string' && url.trim())
    } catch {
      return []
    }
  })()
  return Array.from(new Set([...direct, ...checklist]))
}

export async function logBulkRefuseEmail(sqlFn, { inspectionId, status, routing }) {
  try {
    await insertOutboundEmailLog(sqlFn, {
      inspectionId,
      questionId: WALKABOUT_BULK_REFUSE_QID,
      emailTo: WALKABOUT_BULK_REFUSE_EMAIL,
      emailRouting: routing,
      status,
      sentAt: status === 'sent' ? new Date() : null,
    })
  } catch (error) {
    console.warn('[walkabout-email] Bulk refuse email log failed:', error?.message || error)
  }
}

export async function sendBulkRefuseWalkaboutEmail(sqlFn, {
  request,
  inspectionId,
  estateName,
  locationLine,
  answers,
  answerExtras,
  posterPdfUrl,
  submittedAt,
}) {
  if (normalizeYesNoAnswer(answers?.[WALKABOUT_BULK_REFUSE_QID]) !== 'yes') {
    return { sent: 0, failed: [] }
  }

  const dateInspected = answers?.ew_sig_inspection_date || submittedAt || new Date().toISOString()
  const inspectionVisitDate = answers?.ew_q_planned_date || ''
  const responsiblePerson = await getActivePersonName(sqlFn, answers?.ew_q_responsible)
  const role = String(answers?.ew_q_role || '').trim()
  const estateArea = String(answers?.ew_q_area || '').trim()
  const exactLocation = String(answers?.ew_it_bulk_refuse_exact_location || locationLine || estateArea || '').trim()
  const comments = String(answers?.ew_it_bulk_refuse_comments || answers?.ew_it_comments || '').trim()
  const photoUrls = collectBulkRefusePhotoUrls({ answerExtras, answers })
  const baseUrl = getAppBaseUrl(request)
  const inspectionUrl = `${baseUrl}/inspections/${inspectionId}`
  const subject = `Estate Walkabout – Bulk Refuse Removal Required – ${estateName || estateArea || 'Estate'} – ${formatDateGb(dateInspected)}`
  const photoHtml = photoUrls.length
    ? `<ul>${photoUrls.map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`).join('')}</ul>`
    : '<p>No photo link was provided for this question.</p>'
  const posterHtml = posterPdfUrl
    ? `<li>Action plan / poster: <a href="${escapeHtml(posterPdfUrl)}">${escapeHtml(posterPdfUrl)}</a></li>`
    : '<li>Action plan / poster: Not generated</li>'
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
      ${croydonLogoEmailHeaderHtml()}
      <p>Hello,</p>
      <p>A bulk refuse removal has been identified during an Estate Walkabout.</p>
      <h2 style="font-size:16px">Inspection details</h2>
      <ul>
        <li>Estate / Area: ${escapeHtml(estateArea || '—')}</li>
        <li>Block / Location: ${escapeHtml(locationLine || '—')}</li>
        <li>Ward: —</li>
        <li>Date inspected: ${escapeHtml(formatDateGb(dateInspected) || '—')}</li>
        <li>Inspection visit date: ${escapeHtml(formatDateGb(inspectionVisitDate) || inspectionVisitDate || '—')}</li>
        <li>Responsible person: ${escapeHtml(responsiblePerson || '—')}</li>
        <li>Role: ${escapeHtml(role || '—')}</li>
      </ul>
      <h2 style="font-size:16px">Issue raised</h2>
      <ul>
        <li>Bulk refuse removal required: Yes</li>
        <li>Exact location: ${escapeHtml(exactLocation || '—')}</li>
        <li>Comments entered by inspector: ${escapeHtml(comments || '—')}</li>
      </ul>
      <p><strong>Photo attached or link to photo(s):</strong></p>
      ${photoHtml}
      <h2 style="font-size:16px">Actions</h2>
      <p>Please arrange removal and update works/order reference if raised.</p>
      <h2 style="font-size:16px">System links</h2>
      <ul>
        <li>Inspection record: <a href="${escapeHtml(inspectionUrl)}">${escapeHtml(inspectionUrl)}</a></li>
        ${posterHtml}
      </ul>
      <p>Thank you.</p>
    </div>
  `
  const text = [
    'Hello,',
    '',
    'A bulk refuse removal has been identified during an Estate Walkabout.',
    '',
    'Inspection details:',
    `- Estate / Area: ${estateArea || '—'}`,
    `- Block / Location: ${locationLine || '—'}`,
    '- Ward: —',
    `- Date inspected: ${formatDateGb(dateInspected) || '—'}`,
    `- Inspection visit date: ${formatDateGb(inspectionVisitDate) || inspectionVisitDate || '—'}`,
    `- Responsible person: ${responsiblePerson || '—'}`,
    `- Role: ${role || '—'}`,
    '',
    'Issue raised:',
    '- Bulk refuse removal required: Yes',
    `- Exact location: ${exactLocation || '—'}`,
    `- Comments entered by inspector: ${comments || '—'}`,
    `- Photo attached or link to photo(s): ${photoUrls.length ? photoUrls.join('; ') : 'No photo link was provided for this question.'}`,
    '',
    'Actions:',
    'Please arrange removal and update works/order reference if raised.',
    '',
    'System links:',
    `- Inspection record link: ${inspectionUrl}`,
    `- Action plan / poster link: ${posterPdfUrl || 'Not generated'}`,
    '',
    'Thank you.',
  ].join('\n')

  const result = await sendAppEmail({
    to: WALKABOUT_BULK_REFUSE_EMAIL,
    subject,
    html,
    text,
  })
  if (result.ok) {
    await logBulkRefuseEmail(sqlFn, {
      inspectionId,
      status: 'sent',
      routing: 'estate_walkabout_bulk_refuse',
    })
    return { sent: 1, failed: [], email: WALKABOUT_BULK_REFUSE_EMAIL }
  }
  await logBulkRefuseEmail(sqlFn, {
    inspectionId,
    status: 'failed',
    routing: `estate_walkabout_bulk_refuse:${result.error || 'send_failed'}`,
  })
  return {
    sent: 0,
    failed: [{ email: WALKABOUT_BULK_REFUSE_EMAIL, error: result.error || 'send_failed' }],
  }
}
