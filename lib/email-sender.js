// Server-only: loads people from Postgres, sends via sendAppEmail, logs outbound_emails.

import { sql } from '@vercel/postgres'
import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function photoUrlsFromAction(action) {
  const raw = action?.photo_urls
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string' && u.trim())
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(p) ? p.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

function buildActionHtmlBlock(action) {
  const photos = photoUrlsFromAction(action)
  const photoLines =
    photos.length > 0
      ? `<ul>${photos.map((u) => `<li><a href="${escapeHtml(u)}">Photo</a></li>`).join('')}</ul>`
      : ''
  const cost = action.cost_code ? `<p><strong>Cost code:</strong> ${escapeHtml(action.cost_code)}</p>` : ''
  return `
    <li style="margin-bottom:1rem;">
      <strong>${escapeHtml(action.section_name || 'Section')}</strong> — ${escapeHtml(action.title || '')}
      ${action.comment ? `<p><strong>Comment:</strong> ${escapeHtml(action.comment)}</p>` : ''}
      ${cost}
      ${photoLines}
    </li>
  `
}

function inspectionHeaderHtml({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl }) {
  const title = inspection?.title || inspection?.location_label || inspection?.id || 'Inspection'
  const pdf =
    fullPdfUrl && String(fullPdfUrl).trim()
      ? `<p><strong>Full report (PDF):</strong> <a href="${escapeHtml(fullPdfUrl)}">Open / download</a></p>`
      : ''
  const poster =
    posterPdfUrl && String(posterPdfUrl).trim()
      ? `<p><strong>Actions poster (PDF):</strong> <a href="${escapeHtml(posterPdfUrl)}">Open / download</a></p>`
      : ''
  return `
    <p><strong>Inspection:</strong> ${escapeHtml(title)}</p>
    ${estateBlockLine ? `<p><strong>Location:</strong> ${escapeHtml(estateBlockLine)}</p>` : ''}
    ${pdf}
    ${poster}
  `
}

async function safeLog(sqlFn, row) {
  try {
    await insertOutboundEmailLog(sqlFn, row)
  } catch (e) {
    console.error('[sendEmails] outbound_emails insert failed:', e)
  }
}

/**
 * @param {import('@vercel/postgres').Sql} sqlFn
 * @param {{
 *   inspectionId: string,
 *   inspection: Record<string, unknown>,
 *   estateBlockLine?: string,
 *   fullPdfUrl?: string | null,
 *   posterPdfUrl?: string | null,
 *   recipients: string[],
 *   actionCategories: Array<{ category?: string, count?: string | number, action_list?: string }>,
 *   allActions: Record<string, unknown>[],
 * }} params
 */
export async function sendEmails({
  sql: sqlFn = sql,
  inspectionId,
  inspection,
  estateBlockLine = '',
  fullPdfUrl = null,
  posterPdfUrl = null,
  recipients = [],
  actionCategories = [],
  allActions = [],
}) {
  const sent = []
  const failed = []
  const loc = String(estateBlockLine || inspection?.location_label || '').trim()

  const categoryEmails = {
    repairs: process.env.REPAIRS_EMAIL || '',
    grounds: process.env.GROUNDS_EMAIL || '',
    cleaning: process.env.CLEANING_EMAIL || '',
    asb: process.env.ASB_EMAIL || '',
    health_safety: process.env.HEALTH_SAFETY_EMAIL || '',
    fire_safety: process.env.FIRE_SAFETY_EMAIL || '',
    other: process.env.OTHER_EMAIL || '',
  }

  // 1) Selected inspection recipients (people ids)
  for (const recipientId of recipients) {
    const rid = String(recipientId || '').trim()
    if (!rid) continue
    try {
      const personRes = await sqlFn`
        SELECT id, name, email FROM people
        WHERE id = ${rid} AND COALESCE(active, true) = true
        LIMIT 1
      `
      const person = personRes.rows[0]
      if (!person?.email) {
        failed.push({ recipient_id: rid, error: 'person_not_found_or_no_email' })
        await safeLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: 'undeliverable@inspection.local',
          emailRouting: `targeted_recipient_missing:${rid}`,
          status: 'failed',
          sentAt: null,
        })
        continue
      }

      const relatedActions = (allActions || []).filter((a) => String(a.recipient_person_id || '') === rid)
      const actionsHtml =
        relatedActions.length > 0
          ? `<h2>Issues / actions</h2><ol style="padding-left:1.25rem;">${relatedActions.map(buildActionHtmlBlock).join('')}</ol>`
          : allActions.length > 0
            ? `<h2>All open actions (this inspection)</h2><ol style="padding-left:1.25rem;">${allActions.map(buildActionHtmlBlock).join('')}</ol>`
            : '<p><em>No open actions recorded for this inspection.</em></p>'

      const html = `
        <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
          <h1 style="font-size:18px;">Inspection submitted</h1>
          ${inspectionHeaderHtml({ inspection, estateBlockLine: loc, fullPdfUrl, posterPdfUrl })}
          ${actionsHtml}
        </div>
      `
      const text = `Inspection submitted\n${loc ? `Location: ${loc}\n` : ''}${fullPdfUrl ? `Report PDF: ${fullPdfUrl}\n` : ''}`

      const sendResult = await sendAppEmail({
        to: person.email,
        subject: `Inspection report: ${loc || inspection?.title || inspection?.location_label || 'Estate inspection'}`,
        html,
        text,
      })

      if (sendResult.ok) {
        sent.push({ email: person.email, person_id: person.id, type: 'targeted' })
        await safeLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: person.email,
          emailRouting: 'targeted_recipient',
          status: 'sent',
          sentAt: new Date(),
        })
      } else {
        failed.push({
          email: person.email,
          person_id: person.id,
          error: sendResult.error || 'send_failed',
        })
        await safeLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: person.email,
          emailRouting: `targeted_recipient:${sendResult.error || 'failed'}`,
          status: 'failed',
          sentAt: null,
        })
      }
    } catch (error) {
      console.error(`[sendEmails] targeted loop error for ${rid}:`, error)
      failed.push({ recipient_id: rid, error: error?.message || String(error) })
      await safeLog(sqlFn, {
        inspectionId,
        questionId: null,
        emailTo: 'undeliverable@inspection.local',
        emailRouting: `targeted_recipient:${rid}:${error?.message || 'error'}`,
        status: 'failed',
        sentAt: null,
      })
    }
  }

  // 2) Category mailboxes (env)
  for (const categoryGroup of actionCategories || []) {
    const category = categoryGroup?.category
    const categoryEmail = category ? categoryEmails[category] : ''
    if (!categoryEmail || !String(categoryEmail).trim()) continue

    const categoryActions = (allActions || []).filter((a) => a.category === category)
    const actionList = categoryActions
      .map((action) => {
        let line = `• ${action.section_name || 'Section'} – ${action.title}${action.comment ? ` (${action.comment})` : ''}`
        if (action.cost_code) line += ` [Cost code: ${action.cost_code}]`
        return line
      })
      .join('\n')

    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
        <h1 style="font-size:18px;">New ${escapeHtml(String(category))} actions</h1>
        ${inspectionHeaderHtml({ inspection, estateBlockLine: loc, fullPdfUrl, posterPdfUrl })}
        <p><strong>Count:</strong> ${escapeHtml(String(categoryGroup.count ?? categoryActions.length))}</p>
        <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(actionList || '—')}</pre>
      </div>
    `

    try {
      const sendResult = await sendAppEmail({
        to: categoryEmail,
        subject: `New ${category} actions: ${loc || inspection?.title || 'Inspection'}`,
        html,
        text: actionList,
      })
      if (sendResult.ok) {
        sent.push({ email: categoryEmail, type: 'category', category, count: categoryGroup.count })
        await safeLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: categoryEmail,
          emailRouting: `category:${category}`,
          status: 'sent',
          sentAt: new Date(),
        })
      } else {
        failed.push({ category, email: categoryEmail, error: sendResult.error })
        await safeLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: categoryEmail,
          emailRouting: `category:${category}:${sendResult.error}`,
          status: 'failed',
          sentAt: null,
        })
      }
    } catch (error) {
      console.error(`[sendEmails] category ${category}:`, error)
      failed.push({ category, error: error?.message || String(error) })
      await safeLog(sqlFn, {
        inspectionId,
        questionId: null,
        emailTo: categoryEmail,
        emailRouting: `category:${category}:${error?.message}`,
        status: 'failed',
        sentAt: null,
      })
    }
  }

  // 3) Any open action with resolved recipient + email (e.g. NV / routing rules) not covered above
  const directedActions = (allActions || []).filter((a) => a.recipient_person_id && a.recipient_email)
  const recipientMap = new Map()
  for (const action of directedActions) {
    const pid = String(action.recipient_person_id)
    if (!recipientMap.has(pid)) {
      recipientMap.set(pid, {
        person_id: action.recipient_person_id,
        email: action.recipient_email,
        name: action.recipient_name,
        actions: [],
      })
    }
    recipientMap.get(pid).actions.push(action)
  }

  const alreadyTargeted = new Set((recipients || []).map((r) => String(r).trim()).filter(Boolean))

  for (const recipient of recipientMap.values()) {
    if (alreadyTargeted.has(String(recipient.person_id))) continue

    try {
      const actionListHtml = `<ol style="padding-left:1.25rem;">${recipient.actions.map(buildActionHtmlBlock).join('')}</ol>`
      const html = `
        <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
          <h1 style="font-size:18px;">Action required</h1>
          ${inspectionHeaderHtml({ inspection, estateBlockLine: loc, fullPdfUrl, posterPdfUrl })}
          <p><strong>For:</strong> ${escapeHtml(recipient.name || recipient.email)}</p>
          ${actionListHtml}
        </div>
      `
      const text = recipient.actions
        .map((a) => `• ${a.section_name || ''} – ${a.title}${a.comment ? ` (${a.comment})` : ''}`)
        .join('\n')

      const sendResult = await sendAppEmail({
        to: recipient.email,
        subject: `Action required: ${loc || inspection?.title || 'Inspection'}`,
        html,
        text,
      })

      if (sendResult.ok) {
        sent.push({
          email: recipient.email,
          person_id: recipient.person_id,
          type: 'action_recipient',
          count: recipient.actions.length,
        })
        await safeLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: recipient.email,
          emailRouting: 'action_recipient',
          status: 'sent',
          sentAt: new Date(),
        })
      } else {
        failed.push({ recipient: recipient.email, error: sendResult.error })
        await safeLog(sqlFn, {
          inspectionId,
          questionId: null,
          emailTo: recipient.email,
          emailRouting: `action_recipient:${sendResult.error}`,
          status: 'failed',
          sentAt: null,
        })
      }
    } catch (error) {
      console.error(`[sendEmails] directed ${recipient.email}:`, error)
      failed.push({ recipient: recipient.email, error: error?.message || String(error) })
      await safeLog(sqlFn, {
        inspectionId,
        questionId: null,
        emailTo: recipient.email,
        emailRouting: `action_recipient:${error?.message}`,
        status: 'failed',
        sentAt: null,
      })
    }
  }

  return { sent, failed }
}
