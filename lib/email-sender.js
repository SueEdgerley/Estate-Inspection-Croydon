// Server-only: loads people from Postgres, sends via sendAppEmail, logs outbound_emails.

import { sql } from '@vercel/postgres'
import { sendAppEmail } from '@/lib/send-app-email'
import { insertOutboundEmailLog } from '@/lib/outbound-email-log'
import { buildActionDisplay, categoryLabel, formatActionDate } from '@/lib/action-display-formatter'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeDisplayText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function actionSummary(action) {
  const display = buildActionDisplay(action)
  const issue = display.issue || 'Action recorded'
  const section = normalizeDisplayText(display.section) === normalizeDisplayText(issue) ? '' : display.section
  const comment = normalizeDisplayText(display.comment) === normalizeDisplayText(issue) ? '' : display.comment
  return { display, issue, section, comment }
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

function buildCleanActionHtmlBlock(action) {
  const { display, issue, section, comment } = actionSummary(action)
  const details = [
    section ? ['Area', section] : null,
    display.rating ? ['Answer', display.rating] : null,
    comment ? ['Comment', comment] : null,
    display.priority ? ['Priority', display.priority] : null,
    display.status ? ['Status', display.status] : null,
    display.hasPhoto ? ['Photo', 'Photo attached'] : null,
  ].filter(Boolean)

  return `
    <li style="margin:0 0 16px 0;padding:0 0 14px 0;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 8px 0;"><strong>${escapeHtml(issue)}</strong></p>
      ${
        details.length > 0
          ? `<dl style="margin:0;">${details
              .map(
                ([label, value]) => `
                  <dt style="font-weight:700;margin:8px 0 2px 0;">${escapeHtml(label)}:</dt>
                  <dd style="margin:0;">${escapeHtml(value)}</dd>
                `
              )
              .join('')}</dl>`
          : ''
      }
    </li>
  `
}

function actionTextBlock(action, index) {
  const { display, issue, section, comment } = actionSummary(action)
  const lines = [`${index}. ${issue}`]
  if (section) lines.push(`Area: ${section}`)
  if (display.rating) lines.push(`Answer: ${display.rating}`)
  if (comment) lines.push(`Comment: ${comment}`)
  if (display.priority) lines.push(`Priority: ${display.priority}`)
  if (display.status) lines.push(`Status: ${display.status}`)
  if (display.hasPhoto) lines.push('Photo: Photo attached')
  return lines.join('\n')
}

function firstPresent(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function inspectionDisplayContext({ inspection, estateBlockLine, actions = [] }) {
  const firstActionDisplay = actions.map((action) => buildActionDisplay(action)).find(Boolean) || {}
  const form = firstPresent(
    inspection?.template_name,
    inspection?.template_title,
    inspection?.inspection_template_name,
    inspection?.form_name,
    firstActionDisplay.inspectionTemplateName,
    inspection?.title,
    'Inspection'
  )
  const location = firstPresent(estateBlockLine, inspection?.location_label, firstActionDisplay.contextLocation)
  const completedBy = firstPresent(
    inspection?.inspector_name,
    inspection?.inspector_email,
    inspection?.inspector_id,
    inspection?.completed_by_name,
    inspection?.completed_by,
    inspection?.created_by_name,
    inspection?.created_by,
    inspection?.submitted_by_name,
    inspection?.submitted_by,
    firstActionDisplay.completedBy
  )
  const inspectionDate = formatActionDate(
    firstPresent(inspection?.submitted_at, inspection?.completed_at, inspection?.created_at),
    { fallback: '' }
  )
  const priority = categoryLabel(firstPresent(inspection?.priority, ...actions.map((action) => action?.priority)))

  return { form, location, completedBy, inspectionDate, priority }
}

function inspectionHeaderHtml({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl, actions = [] }) {
  if (actions.length > 0) return actionInspectionHeaderHtml({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl, actions })
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

function actionInspectionHeaderHtml({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl, actions = [] }) {
  const context = inspectionDisplayContext({ inspection, estateBlockLine, actions })
  const pdf =
    fullPdfUrl && String(fullPdfUrl).trim()
      ? `<li style="margin:0 0 4px 0;"><strong>Full inspection PDF:</strong> <a href="${escapeHtml(fullPdfUrl)}">Open / download</a></li>`
      : ''
  const poster =
    posterPdfUrl && String(posterPdfUrl).trim()
      ? `<li style="margin:0 0 4px 0;"><strong>Action poster PDF:</strong> <a href="${escapeHtml(posterPdfUrl)}">Open / download</a></li>`
      : ''
  return `
    <h2 style="font-size:16px;margin:22px 0 8px 0;">Inspection context</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr><th align="left" style="padding:3px 12px 3px 0;width:130px;">Form:</th><td style="padding:3px 0;">${escapeHtml(context.form)}</td></tr>
        ${context.location ? `<tr><th align="left" style="padding:3px 12px 3px 0;">Location:</th><td style="padding:3px 0;">${escapeHtml(context.location)}</td></tr>` : ''}
        ${context.completedBy ? `<tr><th align="left" style="padding:3px 12px 3px 0;">Completed by:</th><td style="padding:3px 0;">${escapeHtml(context.completedBy)}</td></tr>` : ''}
        ${context.inspectionDate ? `<tr><th align="left" style="padding:3px 12px 3px 0;">Inspection date:</th><td style="padding:3px 0;">${escapeHtml(context.inspectionDate)}</td></tr>` : ''}
        ${context.priority ? `<tr><th align="left" style="padding:3px 12px 3px 0;">Priority:</th><td style="padding:3px 0;">${escapeHtml(context.priority)}</td></tr>` : ''}
      </tbody>
    </table>
    ${
      pdf || poster
        ? `<h2 style="font-size:16px;margin:22px 0 8px 0;">Links</h2><ul style="margin:0 0 18px 0;padding-left:20px;">${poster}${pdf}</ul>`
        : ''
    }
  `
}

function inspectionHeaderText({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl, actions = [] }) {
  const context = inspectionDisplayContext({ inspection, estateBlockLine, actions })
  const lines = [
    'Inspection context:',
    `Form: ${context.form}`,
    context.location ? `Location: ${context.location}` : '',
    context.completedBy ? `Completed by: ${context.completedBy}` : '',
    context.inspectionDate ? `Inspection date: ${context.inspectionDate}` : '',
    context.priority ? `Priority: ${context.priority}` : '',
  ].filter(Boolean)

  if (posterPdfUrl || fullPdfUrl) {
    lines.push('', 'Links:')
    if (posterPdfUrl) lines.push('Action poster PDF: Open / download')
    if (fullPdfUrl) lines.push('Full inspection PDF: Open / download')
  }

  return lines.join('\n')
}

function buildActionEmail({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl, actions = [] }) {
  const actionsHtml =
    actions.length > 0
      ? `<h2 style="font-size:16px;margin:22px 0 8px 0;">Actions</h2><ol style="margin:0;padding-left:22px;">${actions
          .map(buildCleanActionHtmlBlock)
          .join('')}</ol>`
      : '<p><em>No open actions recorded for this inspection.</em></p>'

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:680px;">
      <h1 style="font-size:22px;line-height:1.25;margin:0 0 16px 0;">Action required</h1>
      ${inspectionHeaderHtml({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl, actions })}
      ${actionsHtml}
    </div>
  `

  const text = [
    'Action required',
    '',
    inspectionHeaderText({ inspection, estateBlockLine, fullPdfUrl, posterPdfUrl, actions }),
    '',
    'Actions:',
    actions.length > 0
      ? actions.map((action, index) => actionTextBlock(action, index + 1)).join('\n\n')
      : 'No open actions recorded for this inspection.',
  ].join('\n')

  return { html, text }
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
  console.log('[sendEmails] entered', { inspectionId })

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
      const { html, text } = buildActionEmail({
        inspection,
        estateBlockLine: loc,
        fullPdfUrl,
        posterPdfUrl,
        actions: recipient.actions,
      })

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

  console.log('[sendEmails] emails_sent', { inspectionId, count: sent.length })
  console.log('[sendEmails] email_failures', { inspectionId, count: failed.length, failures: failed })
  return { sent, failed }
}
