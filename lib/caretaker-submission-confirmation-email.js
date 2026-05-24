import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'
import { croydonLogoEmailHeaderHtml } from '@/lib/logo-branding'
import { resolveCaretakerInspectionScope } from '@/lib/caretaker-specific-task-inspection'

export const CARETAKER_SUBMISSION_CONFIRMATION_ROUTING = 'caretaker_submission_confirmation'

const CARETAKER_EMAIL_DEFAULT_BASE_URL = 'https://estateinspections.co.uk'

function getCaretakerEmailBaseUrl() {
  const fromNextPublic = String(process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (fromNextPublic) return fromNextPublic.replace(/\/$/, '')

  const fromAppUrl = String(process.env.APP_URL || '').trim()
  if (fromAppUrl) return fromAppUrl.replace(/\/$/, '')

  const vercelUrl = String(process.env.VERCEL_URL || '').trim()
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  }

  return CARETAKER_EMAIL_DEFAULT_BASE_URL
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatSubmittedAt(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildCaretakerInspectionViewUrl(inspectionId, baseUrl = getCaretakerEmailBaseUrl()) {
  const origin = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!origin || !inspectionId) return ''
  return `${origin}/caretaker/inspections/${encodeURIComponent(String(inspectionId))}`
}

export function buildCaretakerSubmissionConfirmationEmailContent({
  inspectionTitle,
  estateBlockLine,
  scopeLabel,
  submittedAtIso,
  inspectorName,
  viewUrl,
  pdfUrl,
  baseUrl,
}) {
  const submittedLine = formatSubmittedAt(submittedAtIso)
  const title = inspectionTitle || 'Caretaker inspection'
  const location = estateBlockLine || '—'
  const scope = scopeLabel || 'Full inspection'
  const inspector = inspectorName || '—'
  const subject = `Inspection submitted — ${location !== '—' ? location : title}`

  const pdfBlock = pdfUrl
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#374151;">
         A PDF report is available from your inspection page.
       </p>`
    : ''

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:560px;">
      ${croydonLogoEmailHeaderHtml(baseUrl)}
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">Your inspection has been submitted successfully</h1>
      <p style="margin:0 0 16px;color:#374151;">
        This email confirms your inspection was saved on the server. The original answers, photos, and submission time are locked as evidence.
        You can add follow-up notes later without changing the original record.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">Location</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(location)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Inspection</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(title)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Scope</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(scope)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Submitted</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(submittedLine)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Submitted by</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(inspector)}</td></tr>
      </table>
      ${
        viewUrl
          ? `<p style="margin:0 0 12px;">
               <a href="${escapeHtml(viewUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
                 View your inspection
               </a>
             </p>
             <p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all;">${escapeHtml(viewUrl)}</p>`
          : ''
      }
      ${pdfBlock}
      <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">
        Open the link on your phone to review the report or add follow-up comments (for example repair updates or completion notes).
      </p>
    </div>
  `

  const text = [
    'Your inspection has been submitted successfully.',
    '',
    `Location: ${location}`,
    `Inspection: ${title}`,
    `Scope: ${scope}`,
    `Submitted: ${submittedLine}`,
    `Submitted by: ${inspector}`,
    '',
    viewUrl ? `View your inspection: ${viewUrl}` : '',
    pdfUrl ? 'A PDF report can be downloaded from your inspection page.' : '',
    '',
    'The original inspection is locked. You can add follow-up notes from the inspection page without changing the original evidence.',
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}

export async function caretakerSubmissionConfirmationAlreadySent(sql, inspectionId, emailTo) {
  try {
    const result = await sql`
      SELECT id FROM outbound_emails
      WHERE inspection_id = ${inspectionId}
        AND email_routing = ${CARETAKER_SUBMISSION_CONFIRMATION_ROUTING}
        AND lower(trim(COALESCE(email_to, ''))) = lower(trim(${emailTo}))
        AND status = 'sent'
      LIMIT 1
    `
    return result.rows.length > 0
  } catch {
    return false
  }
}

/**
 * Send caretaker a submission confirmation with a secure link to their report.
 * Idempotent: skips if already logged as sent for this inspection + recipient.
 */
export async function sendCaretakerSubmissionConfirmationEmail({
  sql,
  inspectionId,
  inspection,
  inspectorEmail,
  inspectorName,
  estateBlockLine,
  fullPdfUrl,
}) {
  const emailTo = String(inspectorEmail || '').trim()
  if (!emailTo) {
    return { ok: false, skipped: true, reason: 'missing_inspector_email' }
  }

  if (await caretakerSubmissionConfirmationAlreadySent(sql, inspectionId, emailTo)) {
    return { ok: true, skipped: true, reason: 'already_sent' }
  }

  const baseUrl = getCaretakerEmailBaseUrl()
  console.log('[caretaker email] baseUrl source', {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    APP_URL: process.env.APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    resolvedBaseUrl: baseUrl,
  })
  const scope = resolveCaretakerInspectionScope(inspection || {})
  const viewUrl = buildCaretakerInspectionViewUrl(inspectionId, baseUrl)
  const { subject, html, text } = buildCaretakerSubmissionConfirmationEmailContent({
    inspectionTitle: inspection?.template_name || inspection?.title || 'Caretaker inspection',
    estateBlockLine,
    scopeLabel: scope.scopeLabel,
    submittedAtIso: inspection?.submitted_at || new Date().toISOString(),
    inspectorName: inspectorName || inspection?.inspector_name,
    viewUrl,
    pdfUrl: fullPdfUrl || null,
    baseUrl,
  })

  const sendResult = await sendAppEmail({ to: emailTo, subject, html, text })

  await insertOutboundEmailLog(sql, {
    inspectionId,
    emailTo,
    recipientEmail: emailTo,
    subject,
    provider: sendResult.provider || null,
    providerMessageId: sendResult.id || null,
    emailRouting: CARETAKER_SUBMISSION_CONFIRMATION_ROUTING,
    status: sendResult.ok ? 'sent' : 'failed',
    errorMessage: sendResult.ok ? null : sendResult.error || 'send_failed',
    sentAt: sendResult.ok ? new Date() : null,
  })

  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error || 'send_failed', to: emailTo }
  }

  return { ok: true, to: emailTo, viewUrl }
}
