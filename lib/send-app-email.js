/**
 * Send a transactional email (Resend REST when configured).
 * @returns {Promise<{ ok: boolean, provider?: string, error?: string, id?: string }>}
 */
export async function sendAppEmail({ to, subject, html, text }) {
  const emailTo = String(to || '').trim()
  if (!emailTo) {
    return { ok: false, error: 'missing_to' }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    const from = process.env.RESEND_FROM_EMAIL || 'Estate Inspections <onboarding@resend.dev>'
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [emailTo],
          subject: String(subject || '').slice(0, 998),
          html: html || undefined,
          text: text || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errMsg =
          (body && (body.message || body.error)) || `resend_http_${res.status}`
        return { ok: false, provider: 'resend', error: String(errMsg) }
      }
      return { ok: true, provider: 'resend', id: body?.id ? String(body.id) : undefined }
    } catch (e) {
      return { ok: false, provider: 'resend', error: e?.message || String(e) }
    }
  }

  return {
    ok: false,
    error: 'no_email_provider',
  }
}
