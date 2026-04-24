/**
 * @param {import('@vercel/postgres').Sql} sql
 * @param {{ inspectionId: string, questionId?: string | null, emailTo: string, emailRouting?: string | null, status: string, sentAt?: Date | null }} row
 */
export async function insertOutboundEmailLog(sql, row) {
  const oid = `oem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  const sentAt = row.status === 'sent' ? row.sentAt || new Date() : null
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
}
