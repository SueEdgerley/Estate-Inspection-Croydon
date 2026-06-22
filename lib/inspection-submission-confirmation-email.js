import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'
import { croydonLogoEmailHeaderHtml } from '@/lib/logo-branding'
import { isCaretakerTemplate } from '@/lib/caretaker-template'
import { resolveCaretakerInspectionScope } from '@/lib/caretaker-specific-task-inspection'

export const INSPECTION_SUBMISSION_CONFIRMATION_ROUTING = 'inspection_submission_confirmation'
/** @deprecated Legacy routing — still checked for idempotency. */
export const CARETAKER_SUBMISSION_CONFIRMATION_ROUTING = 'caretaker_submission_confirmation'

const EMAIL_DEFAULT_BASE_URL = 'https://estateinspections.co.uk'
const EMAIL_RE = /^[^\s@()<>]+@[^\s@()<>]+\.[^\s@()<>]+$/

function getEmailBaseUrl() {
  const fromNextPublic = String(process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (fromNextPublic) return fromNextPublic.replace(/\/$/, '')

  const fromAppUrl = String(process.env.APP_URL || '').trim()
  if (fromAppUrl) return fromAppUrl.replace(/\/$/, '')

  return EMAIL_DEFAULT_BASE_URL
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

function normalizeEmail(value) {
  const email = String(value || '').trim()
  return EMAIL_RE.test(email) ? email : ''
}

export function resolveSubmitterEmail(inspectorEmail, inspection) {
  return (
    normalizeEmail(inspectorEmail) ||
    normalizeEmail(inspection?.inspector_id) ||
    normalizeEmail(inspection?.inspector_email) ||
    ''
  )
}

function templateProbeFrom({ templateVersion, inspection }) {
  if (templateVersion && typeof templateVersion === 'object') {
    return {
      id: templateVersion.id ?? inspection?.template_id,
      name: templateVersion.name ?? inspection?.template_name,
      template_key: templateVersion.template_key,
      template_type: templateVersion.template_type ?? templateVersion.type,
      type: templateVersion.type ?? templateVersion.template_type,
    }
  }
  return {
    name: inspection?.template_name,
    template_type: inspection?.type,
    template_key: inspection?.template_key,
  }
}

export function buildCaretakerInspectionViewUrl(inspectionId, baseUrl = getEmailBaseUrl()) {
  const origin = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!origin || !inspectionId) return ''
  return `${origin}/caretaker/inspections/${encodeURIComponent(String(inspectionId))}`
}

export function buildInspectionViewUrl(inspectionId, { templateVersion, inspection } = {}, baseUrl = getEmailBaseUrl()) {
  const probe = templateProbeFrom({ templateVersion, inspection })
  if (isCaretakerTemplate(probe)) {
    return buildCaretakerInspectionViewUrl(inspectionId, baseUrl)
  }
  const origin = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!origin || !inspectionId) return ''
  return `${origin}/inspections/${encodeURIComponent(String(inspectionId))}`
}

export function buildInspectionSubmissionConfirmationEmailContent({
  inspectionTitle,
  formTypeLabel,
  estateBlockLine,
  scopeLabel,
  submittedAtIso,
  inspectorName,
  viewUrl,
  fullPdfUrl,
  posterPdfUrl,
  baseUrl,
}) {
  const submittedLine = formatSubmittedAt(submittedAtIso)
  const title = inspectionTitle || formTypeLabel || 'Inspection'
  const formType = formTypeLabel || title
  const location = estateBlockLine || '—'
  const inspector = inspectorName || '—'
  const subject = `Inspection submitted — ${location !== '—' ? location : formType}`

  const linkRows = []
  if (fullPdfUrl) {
    linkRows.push(
      `<li style="margin:0 0 4px 0;"><strong>Full inspection report (PDF):</strong> <a href="${escapeHtml(fullPdfUrl)}">Open / download</a></li>`
    )
  }
  if (posterPdfUrl) {
    linkRows.push(
      `<li style="margin:0 0 4px 0;"><strong>Action plan poster (PDF):</strong> <a href="${escapeHtml(posterPdfUrl)}">Open / download</a></li>`
    )
  }
  const linksBlock =
    linkRows.length > 0
      ? `<h2 style="font-size:15px;margin:18px 0 8px;color:#0f172a;">Reports</h2><ul style="margin:0 0 18px 0;padding-left:20px;">${linkRows.join('')}</ul>`
      : `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#374151;">
           PDF reports are available from your inspection page when generated.
         </p>`

  const scopeRow = scopeLabel
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Scope</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(scopeLabel)}</td></tr>`
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
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">Form</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(formType)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Location</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(location)}</td></tr>
        ${scopeRow}
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
      ${linksBlock}
      <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">
        Open the link on your phone to review the report or add follow-up comments.
      </p>
    </div>
  `

  const text = [
    'Your inspection has been submitted successfully.',
    '',
    `Form: ${formType}`,
    `Location: ${location}`,
    scopeLabel ? `Scope: ${scopeLabel}` : '',
    `Submitted: ${submittedLine}`,
    `Submitted by: ${inspector}`,
    '',
    viewUrl ? `View your inspection: ${viewUrl}` : '',
    fullPdfUrl ? `Full inspection report: ${fullPdfUrl}` : '',
    posterPdfUrl ? `Action plan poster: ${posterPdfUrl}` : '',
    '',
    'The original inspection is locked. You can add follow-up notes from the inspection page without changing the original evidence.',
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}

/** @deprecated Use buildInspectionSubmissionConfirmationEmailContent */
export function buildCaretakerSubmissionConfirmationEmailContent(params) {
  return buildInspectionSubmissionConfirmationEmailContent(params)
}

export async function submissionConfirmationAlreadySent(sql, inspectionId, emailTo) {
  try {
    const result = await sql`
      SELECT id FROM outbound_emails
      WHERE inspection_id = ${inspectionId}
        AND email_routing IN (
          ${INSPECTION_SUBMISSION_CONFIRMATION_ROUTING},
          ${CARETAKER_SUBMISSION_CONFIRMATION_ROUTING}
        )
        AND lower(trim(COALESCE(email_to, ''))) = lower(trim(${emailTo}))
        AND status = 'sent'
      LIMIT 1
    `
    return result.rows.length > 0
  } catch {
    return false
  }
}

/** @deprecated Use submissionConfirmationAlreadySent */
export async function caretakerSubmissionConfirmationAlreadySent(sql, inspectionId, emailTo) {
  return submissionConfirmationAlreadySent(sql, inspectionId, emailTo)
}

/**
 * Send submitter a confirmation with inspection summary and links.
 * Idempotent: skips if already logged as sent for this inspection + recipient.
 */
export async function sendInspectionSubmissionConfirmationEmail({
  sql,
  inspectionId,
  inspection,
  templateVersion,
  inspectorEmail,
  inspectorName,
  estateBlockLine,
  fullPdfUrl,
  posterPdfUrl,
}) {
  const emailTo = resolveSubmitterEmail(inspectorEmail, inspection)
  if (!emailTo) {
    return { ok: false, skipped: true, reason: 'missing_submitter_email' }
  }

  if (await submissionConfirmationAlreadySent(sql, inspectionId, emailTo)) {
    return { ok: true, skipped: true, reason: 'already_sent' }
  }

  const baseUrl = getEmailBaseUrl()
  const probe = templateProbeFrom({ templateVersion, inspection })
  const scopeLabel = isCaretakerTemplate(probe)
    ? resolveCaretakerInspectionScope(inspection || {}).scopeLabel
    : null
  const viewUrl = buildInspectionViewUrl(inspectionId, { templateVersion, inspection }, baseUrl)
  const formTypeLabel =
    inspection?.template_name || templateVersion?.name || inspection?.title || 'Inspection'

  const { subject, html, text } = buildInspectionSubmissionConfirmationEmailContent({
    inspectionTitle: inspection?.title || formTypeLabel,
    formTypeLabel,
    estateBlockLine,
    scopeLabel,
    submittedAtIso: inspection?.submitted_at || new Date().toISOString(),
    inspectorName: inspectorName || inspection?.inspector_name,
    viewUrl,
    fullPdfUrl: fullPdfUrl || null,
    posterPdfUrl: posterPdfUrl || null,
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
    emailRouting: INSPECTION_SUBMISSION_CONFIRMATION_ROUTING,
    status: sendResult.ok ? 'sent' : 'failed',
    errorMessage: sendResult.ok ? null : sendResult.error || 'send_failed',
    sentAt: sendResult.ok ? new Date() : null,
  })

  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error || 'send_failed', to: emailTo }
  }

  return { ok: true, to: emailTo, viewUrl }
}

/** @deprecated Use sendInspectionSubmissionConfirmationEmail */
export async function sendCaretakerSubmissionConfirmationEmail(params) {
  return sendInspectionSubmissionConfirmationEmail(params)
}
