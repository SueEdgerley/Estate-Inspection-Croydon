export const CROYDON_HOUSING_LOGO_FILE = 'croydon-housing-logo.png'
export const CROYDON_HOUSING_LOGO_PUBLIC_PATH = `/${CROYDON_HOUSING_LOGO_FILE}`
export const CROYDON_HOUSING_LOGO_ALT = 'Croydon Housing and Croydon Council'

export const PDF_LOGO_MAX_WIDTH = 156
export const PDF_LOGO_MAX_HEIGHT = 40

export const EMAIL_LOGO_WIDTH = 260
export const EMAIL_LOGO_HEIGHT = 36

function appBaseUrlFromEnv() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (explicit && String(explicit).trim()) return String(explicit).trim().replace(/\/$/, '')

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl && String(vercelUrl).trim()) {
    return `https://${String(vercelUrl).trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  }

  return ''
}

/** Public app origin for emails and absolute asset URLs. */
export function getAppBaseUrlFromEnv() {
  return appBaseUrlFromEnv()
}

function escapeHtmlAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function croydonLogoUrl(baseUrl = appBaseUrlFromEnv()) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!normalizedBase) return ''
  return `${normalizedBase}${CROYDON_HOUSING_LOGO_PUBLIC_PATH}`
}

export function croydonLogoEmailHeaderHtml(baseUrl) {
  const logoUrl = croydonLogoUrl(baseUrl)
  if (!logoUrl) return ''

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#ffffff;margin:0 0 18px 0;">
      <tr>
        <td bgcolor="#ffffff" style="padding:0 0 14px 0;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <img src="${escapeHtmlAttribute(logoUrl)}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}" alt="${escapeHtmlAttribute(CROYDON_HOUSING_LOGO_ALT)}" style="display:block;width:${EMAIL_LOGO_WIDTH}px;height:${EMAIL_LOGO_HEIGHT}px;border:0;outline:none;text-decoration:none;background-color:#ffffff;color:#111827;">
        </td>
      </tr>
    </table>
  `
}
