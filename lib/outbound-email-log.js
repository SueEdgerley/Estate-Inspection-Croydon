function isMissingOutboundEmailsTableError(error) {
  return (
    error?.code === '42P01' ||
    /relation\s+"?outbound_emails"?\s+does not exist/i.test(String(error?.message || error || ''))
  )
}

function isMissingColumnError(error) {
  return error?.code === '42703' || /column\s+"?[a-z_]+"?\s+of relation\s+"?outbound_emails"?\s+does not exist/i.test(String(error?.message || error || ''))
}

/**
 * @param {import('@vercel/postgres').Sql} sql
 * @param {{
 *   inspectionId: string,
 *   actionId?: string | null,
 *   questionId?: string | null,
 *   emailTo: string,
 *   recipientEmail?: string | null,
 *   subject?: string | null,
 *   provider?: string | null,
 *   providerMessageId?: string | null,
 *   emailRouting?: string | null,
 *   status: string,
 *   errorMessage?: string | null,
 *   sentAt?: Date | null
 * }} row
 */
export async function insertOutboundEmailLog(sql, row) {
  const oid = `oem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  const sentAt = row.status === 'sent' ? row.sentAt || new Date() : null
  try {
    await sql`
      INSERT INTO outbound_emails (
        id,
        inspection_id,
        action_id,
        question_id,
        email_to,
        recipient_email,
        subject,
        provider,
        provider_message_id,
        email_routing,
        status,
        error_message,
        sent_at
      )
      VALUES (
        ${oid},
        ${row.inspectionId},
        ${row.actionId || null},
        ${row.questionId || null},
        ${row.emailTo},
        ${row.recipientEmail || row.emailTo},
        ${row.subject || null},
        ${row.provider || null},
        ${row.providerMessageId || null},
        ${row.emailRouting || null},
        ${row.status},
        ${row.errorMessage || null},
        ${sentAt}
      )
    `
    return { ok: true, id: oid }
  } catch (error) {
    if (isMissingColumnError(error)) {
      try {
        await sql`
          INSERT INTO outbound_emails (id, inspection_id, question_id, email_to, email_routing, status, sent_at)
          VALUES (
            ${oid},
            ${row.inspectionId},
            ${row.questionId || null},
            ${row.emailTo},
            ${row.emailRouting || null},
            ${row.status},
            ${sentAt}
          )
        `
        return { ok: true, id: oid, fallback: 'legacy_columns' }
      } catch (fallbackError) {
        const fallbackMessage = fallbackError?.message || String(fallbackError)
        console.warn('[outbound-email-log] legacy email log skipped:', fallbackMessage)
        return { ok: false, error: fallbackMessage }
      }
    }

    const message = error?.message || String(error)
    if (isMissingOutboundEmailsTableError(error)) {
      console.warn('[outbound-email-log] outbound_emails table missing; email log skipped:', message)
    } else {
      console.warn('[outbound-email-log] email log skipped:', message)
    }
    return { ok: false, error: message }
  }
}
