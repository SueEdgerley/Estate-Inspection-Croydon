import { NextResponse } from 'next/server'
import { sendAppEmail } from '@/lib/send-app-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Send email (same transport as inspection submit; optional for tests / admin tools)
export async function POST(request) {
  try {
    const body = await request.json()
    const { to, subject, html, text, template, data } = body
    const safe = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    const resolvedHtml =
      html ||
      (data
        ? `<p><strong>${safe(template || 'notification')}</strong></p><pre style="white-space:pre-wrap;font-size:13px;">${safe(
            JSON.stringify(data, null, 2).slice(0, 20000)
          )}</pre>`
        : `<pre style="white-space:pre-wrap;">${safe(text || '')}</pre>`)

    const result = await sendAppEmail({
      to,
      subject: subject || 'Message',
      html: resolvedHtml,
      text: text || undefined,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'send_failed',
          provider: result.provider,
        },
        { status: result.error === 'no_email_provider' ? 503 : 502 }
      )
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      id: result.id,
    })
  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json(
      { error: 'Failed to send email', details: error.message },
      { status: 500 }
    )
  }
}
