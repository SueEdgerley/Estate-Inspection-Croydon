import { ESM_ABANDONED_VEHICLE_AVS_EMAIL } from '@/lib/esm-inspection-form'
import { croydonLogoEmailHeaderHtml } from '@/lib/logo-branding'

const AVS_EMAIL = String(ESM_ABANDONED_VEHICLE_AVS_EMAIL || '').trim()

function clean(value) {
  return String(value || '').trim()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function referralExtras(extras = {}) {
  const structured = extras?.structured && typeof extras.structured === 'object' ? extras.structured : {}
  return { ...structured, ...extras }
}

export function reportingOfficerDisplayName(user) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return name || clean(user?.fullName)
}

export function esmAbandonedVehicleReferralApplies(question, answer) {
  return question?.esm_q4_abandoned_vehicle === true && String(answer || '').trim() === 'Yes'
}

export function esmAbandonedVehicleReferralFieldErrors({ question, answer, extras, officerName, photoUrls } = {}) {
  if (!esmAbandonedVehicleReferralApplies(question, answer)) return []
  return resolveEsmAbandonedVehicleReferral({ extras, officerName, photoUrls }).missing.filter(
    (gap) => gap.field !== 'photo'
  )
}

export function isEsmAbandonedVehicleAvsReferral({ to, routing } = {}) {
  const recipient = clean(to).toLowerCase()
  if (AVS_EMAIL && recipient === AVS_EMAIL.toLowerCase()) return true
  return clean(routing).toLowerCase() === 'esm_abandoned_vehicle_yes'
}

/**
 * Details the AVS team needs from an ESM abandoned-vehicle referral.
 * Officer name uses the signed-in officer when the saved field is empty.
 */
export function resolveEsmAbandonedVehicleReferral({ extras = {}, officerName = '', photoUrls = [] } = {}) {
  const source = referralExtras(extras)
  const costCode = clean(source.cost_code || source.costCode)
  const savedOfficer = clean(source.authorisation_name || source.reporting_officer_name)
  const signedInOfficer = clean(officerName)
  const signedInName = signedInOfficer.includes('@') ? '' : signedInOfficer
  const reportingOfficer = signedInName || savedOfficer || signedInOfficer
  const make = clean(source.vehicle_make) || clean(source.vehicle_make_model)
  const model = clean(source.vehicle_model)
  const registration = clean(source.vehicle_registration)
  const photos = [...new Set((Array.isArray(photoUrls) ? photoUrls : []).map((url) => clean(url)).filter(Boolean))]
  const missing = []
  if (!costCode) {
    missing.push({ field: 'cost_code', message: 'Cost code is required before the AVS referral can be sent' })
  }
  if (!reportingOfficer) {
    missing.push({
      field: 'authorisation_name',
      message: 'Reporting officer name is required before the AVS referral can be sent',
    })
  }
  if (!make) {
    missing.push({ field: 'vehicle_make', message: 'Vehicle make is required before the AVS referral can be sent' })
  }
  if (!model) {
    missing.push({ field: 'vehicle_model', message: 'Vehicle model is required before the AVS referral can be sent' })
  }
  if (!registration) {
    missing.push({
      field: 'vehicle_registration',
      message: 'Registration number is required before the AVS referral can be sent',
    })
  }
  if (photos.length === 0) {
    missing.push({ field: 'photo', message: 'Vehicle photo is required before the AVS referral can be sent' })
  }
  return {
    ok: missing.length === 0,
    missing,
    to: AVS_EMAIL,
    costCode,
    reportingOfficer,
    make,
    model,
    registration,
    photoUrls: photos,
  }
}

export function buildEsmAbandonedVehicleAvsEmail({
  inspectionTitle = '',
  locationLine = '',
  sectionTitle = '',
  questionText = '',
  answer = '',
  comment = '',
  extras = {},
  officerName = '',
  photoUrls = [],
} = {}) {
  const referral = resolveEsmAbandonedVehicleReferral({ extras, officerName, photoUrls })
  if (!referral.ok) {
    return { ok: false, send: false, missing: referral.missing, to: referral.to, html: '', text: '' }
  }

  const rows = [
    ['Cost code', referral.costCode],
    ['Reporting officer', referral.reportingOfficer],
    ['Vehicle make', referral.make],
    ['Vehicle model', referral.model],
    ['Registration number', referral.registration],
  ]
  const detailHtml = rows
    .map(
      ([label, value]) =>
        `<p style="margin:0 0 6px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
    )
    .join('')
  const photoList = `<ul>${referral.photoUrls
    .map((url) => `<li><a href="${escapeHtml(url)}">Photo attached</a></li>`)
    .join('')}</ul>`
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:680px;">
      ${croydonLogoEmailHeaderHtml()}
      <h1 style="font-size:20px;line-height:1.25;margin:0 0 16px 0;">ESM abandoned vehicle referral</h1>
      <p style="margin:0 0 6px 0;"><strong>Inspection:</strong> ${escapeHtml(inspectionTitle || 'ESM inspection')}</p>
      ${locationLine ? `<p style="margin:0 0 6px 0;"><strong>Location:</strong> ${escapeHtml(locationLine)}</p>` : ''}
      ${sectionTitle ? `<p style="margin:0 0 6px 0;"><strong>Section:</strong> ${escapeHtml(sectionTitle)}</p>` : ''}
      ${questionText ? `<p style="margin:0 0 6px 0;"><strong>Question:</strong> ${escapeHtml(questionText)}</p>` : ''}
      <p style="margin:0 0 6px 0;"><strong>Answer:</strong> ${escapeHtml(answer || 'Yes')}</p>
      <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">Vehicle details</h2>
      ${detailHtml}
      ${comment ? `<p style="margin:0 0 6px 0;"><strong>Comment:</strong> ${escapeHtml(comment)}</p>` : ''}
      <h2 style="font-size:16px;line-height:1.3;margin:20px 0 8px 0;">Photos</h2>
      ${photoList}
    </div>
  `
  const text = [
    'ESM abandoned vehicle referral',
    '',
    `Inspection: ${inspectionTitle || 'ESM inspection'}`,
    locationLine ? `Location: ${locationLine}` : '',
    sectionTitle ? `Section: ${sectionTitle}` : '',
    questionText ? `Question: ${questionText}` : '',
    `Answer: ${answer || 'Yes'}`,
    '',
    'Vehicle details',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    comment ? `Comment: ${comment}` : '',
    '',
    'Photos',
    ...referral.photoUrls.map((url) => `Photo attached: ${url}`),
  ]
    .filter((line) => line !== '')
    .join('\n')

  return { ok: true, send: true, missing: [], to: referral.to, html, text }
}
