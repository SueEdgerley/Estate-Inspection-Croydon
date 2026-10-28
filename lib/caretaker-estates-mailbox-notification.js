/**
 * Caretaker notifications sent to the Housing Estate Services mailbox only.
 * Other caretaker recipients, forms, and confirmation emails are unchanged.
 *
 * Subject, submitter, block/address, and the report link are taken from one
 * saved inspection row. The report URL is the existing /inspections/[id] page,
 * so the app’s normal sign-in and access checks still apply.
 */
import { croydonLogoEmailHeaderHtml, croydonLogoUrl } from '@/lib/logo-branding'

/** Current Housing Estate Services mailbox. Routing is unchanged. */
export const CARETAKER_ESTATES_MAILBOX_EMAIL = 'housingestateservices@croydon.gov.uk'

const PUBLIC_APP_ORIGIN = 'https://estateinspections.co.uk'

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(collapse(value))
}

/**
 * Public https origin for links in this email.
 * Does not use VERCEL_URL: that host is often a deployment URL email clients
 * cannot load, which is why the council logo was arriving as a broken image.
 * A malformed NEXT_PUBLIC_APP_URL such as `https://host.api:443` is reduced to
 * the real host before the existing /croydon-housing-logo.png asset is added.
 */
export function normalisePublicHttpsOrigin(value) {
  const raw = collapse(value)
  if (!raw) return ''
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url
  try {
    url = new URL(withProtocol)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
  const hostname = url.hostname.replace(/\.api$/i, '')
  if (!hostname || !hostname.includes('.')) return ''
  return `https://${hostname}`
}

export function caretakerNotificationPublicBaseUrl(env = process.env) {
  const fromPublic = normalisePublicHttpsOrigin(env?.NEXT_PUBLIC_APP_URL)
  if (fromPublic) return fromPublic
  const fromApp = normalisePublicHttpsOrigin(env?.APP_URL)
  if (fromApp) return fromApp
  return PUBLIC_APP_ORIGIN
}

export function isCaretakerEstatesMailboxEmail(email, mailbox = CARETAKER_ESTATES_MAILBOX_EMAIL) {
  const to = collapse(email).toLowerCase()
  const expected = collapse(mailbox).toLowerCase()
  return Boolean(to && expected && to === expected)
}

/** Block name from the saved inspection. Location notes are not the address. */
export function formatCaretakerBlockAddress({ blockName, locationLabel } = {}) {
  const block = collapse(blockName)
  if (block) return block
  return collapse(locationLabel)
}

/**
 * Saved inspector name. A directory name is used only when the saved value is
 * missing or is an email address. The automated Resend sender is never used.
 */
export function resolveCaretakerSubmitterName(row = {}) {
  const savedName = collapse(row.inspector_name)
  const directoryName = collapse(row.person_name)
  if (savedName && !looksLikeEmail(savedName)) return savedName
  if (directoryName && !looksLikeEmail(directoryName)) return directoryName
  return savedName
}

/** Visit time recorded on the inspection, otherwise the time it was submitted. */
export function resolveCaretakerInspectionDate(row = {}) {
  return row.inspection_start_time || row.submitted_at || null
}

export function caretakerEstatesMailboxInspectionFromRow(row) {
  if (!row || row.id == null || collapse(row.id) === '') return null
  return {
    id: collapse(row.id),
    submittedBy: resolveCaretakerSubmitterName(row),
    blockAddress: formatCaretakerBlockAddress({
      blockName: row.block_name,
      locationLabel: row.location_label,
    }),
    inspectionDate: resolveCaretakerInspectionDate(row),
  }
}

/**
 * Keep the subject, body, and report link on one inspection.
 * A row for a different id is ignored so another inspection’s name or block
 * cannot be paired with this notification.
 */
export function fieldsForCaretakerEstatesMailboxEmail(saved, inspectionId, fallbacks = {}) {
  const id = collapse(inspectionId)
  const same = Boolean(saved && collapse(saved.id) === id)
  const source = same ? saved : null
  return {
    inspectionId: id,
    submittedBy: source?.submittedBy || collapse(fallbacks.submittedBy),
    blockAddress: source?.blockAddress || collapse(fallbacks.blockAddress),
    inspectionDate: source ? source.inspectionDate : fallbacks.inspectionDate || null,
    sameInspection: same,
  }
}

export async function loadCaretakerEstatesMailboxInspection(sqlFn, inspectionId) {
  const id = collapse(inspectionId)
  if (!id || typeof sqlFn !== 'function') return null
  const result = await sqlFn`
    SELECT
      i.id,
      NULLIF(TRIM(i.inspector_name), '') AS inspector_name,
      i.inspection_start_time,
      i.submitted_at,
      NULLIF(TRIM(b.name), '') AS block_name,
      NULLIF(TRIM(i.location_label), '') AS location_label,
      (
        SELECT NULLIF(TRIM(p.name), '')
        FROM people p
        WHERE lower(trim(p.email)) = lower(trim(i.inspector_id))
          AND COALESCE(p.active, true) = true
        ORDER BY p.name
        LIMIT 1
      ) AS person_name
    FROM inspections i
    LEFT JOIN blocks b ON b.id = i.block_id
    WHERE i.id = ${id}
    LIMIT 1
  `
  const row = result?.rows?.[0]
  return row ? caretakerEstatesMailboxInspectionFromRow(row) : null
}

export function formatCaretakerInspectionDate(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayValue(value) {
  return collapse(value) || '—'
}

function subjectPart(value) {
  const text = collapse(value).replace(/\|/g, '/')
  return text || '—'
}

export function buildCaretakerInspectionReportUrl(inspectionId, baseUrl = caretakerNotificationPublicBaseUrl()) {
  const origin = normalisePublicHttpsOrigin(baseUrl) || caretakerNotificationPublicBaseUrl()
  const id = collapse(inspectionId)
  if (!id) return ''
  return `${origin}/inspections/${encodeURIComponent(id)}`
}

export function buildCaretakerEstatesMailboxSubject({ submittedBy, blockAddress, questionText } = {}) {
  return [
    'Caretaker inspection',
    subjectPart(submittedBy),
    subjectPart(blockAddress),
    subjectPart(questionText),
  ].join(' | ')
}

function photoListHtml(photoUrls) {
  const urls = (Array.isArray(photoUrls) ? photoUrls : []).map((url) => collapse(url)).filter(Boolean)
  if (!urls.length) return '<p style="margin:0;"><strong>Photos:</strong> No photo link recorded.</p>'
  const items = urls
    .map((url) => `<li style="margin:0 0 4px;"><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`)
    .join('')
  return `<p style="margin:0 0 4px;"><strong>Photos:</strong></p><ul style="margin:0;padding-left:20px;">${items}</ul>`
}

function photoListText(photoUrls) {
  const urls = (Array.isArray(photoUrls) ? photoUrls : []).map((url) => collapse(url)).filter(Boolean)
  if (!urls.length) return 'Photos: No photo link recorded.'
  return ['Photos:', ...urls].join('\n')
}

export function buildCaretakerEstatesMailboxNotification({
  inspectionId,
  submittedBy,
  blockAddress,
  inspectionDate,
  sectionTitle,
  questionText,
  answer,
  comment,
  photoUrls,
  reminder = '',
  baseUrl,
} = {}) {
  const origin = normalisePublicHttpsOrigin(baseUrl) || caretakerNotificationPublicBaseUrl()
  const reportUrl = buildCaretakerInspectionReportUrl(inspectionId, origin)
  const logoUrl = croydonLogoUrl(origin)
  const submitted = displayValue(submittedBy)
  const block = displayValue(blockAddress)
  const section = displayValue(sectionTitle)
  const question = displayValue(questionText)
  const answerText = displayValue(answer)
  const commentText = collapse(comment) || 'None recorded.'
  const when = formatCaretakerInspectionDate(inspectionDate) || '—'
  const subject = buildCaretakerEstatesMailboxSubject({
    submittedBy,
    blockAddress,
    questionText,
  })
  const reminderText = collapse(reminder)

  const detailRow = (label, value) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;width:150px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(value)}</td></tr>`

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:640px;">
      ${croydonLogoEmailHeaderHtml(origin)}
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">Caretaker inspection notification</h1>
      ${
        reportUrl
          ? `<p style="margin:0 0 8px;">
               <a href="${escapeHtml(reportUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
                 View full inspection report
               </a>
             </p>
             <p style="margin:0 0 18px;font-size:13px;color:#6b7280;word-break:break-all;">${escapeHtml(reportUrl)}</p>`
          : ''
      }
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 12px;">
        ${detailRow('Submitted by', submitted)}
        ${detailRow('Block/address', block)}
        ${detailRow('Inspection date', when)}
        ${detailRow('Section', section)}
        ${detailRow('Question/issue', question)}
        ${detailRow('Answer', answerText)}
        ${detailRow('Comments', commentText)}
      </table>
      ${photoListHtml(photoUrls)}
      ${reminderText ? `<p style="margin:12px 0 0;">${escapeHtml(reminderText)}</p>` : ''}
    </div>
  `

  const text = [
    'Caretaker inspection notification',
    '',
    ...(reportUrl ? [`View full inspection report: ${reportUrl}`, ''] : []),
    `Submitted by: ${submitted}`,
    `Block/address: ${block}`,
    `Inspection date: ${when}`,
    `Section: ${section}`,
    `Question/issue: ${question}`,
    `Answer: ${answerText}`,
    `Comments: ${commentText}`,
    photoListText(photoUrls),
    ...(reminderText ? ['', reminderText] : []),
  ].join('\n')

  return { subject, html, text, reportUrl, logoUrl }
}
