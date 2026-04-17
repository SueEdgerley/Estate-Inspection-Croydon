import { unpackNvWizardNotes } from './nv-notes-pack.js'
import { NV_Q24_SUBISSUES } from './neighbourhood-voice-question-schema.js'
import { resolveIssueRoutingRecipient } from './resolve-issue-routing.js'

function gradeFromRow(row) {
  const v = row.answer_value ?? row.answer_text
  return v != null ? String(v).trim().toUpperCase() : ''
}

function extrasFromAnswerRow(row) {
  const { structured, plainComment } = unpackNvWizardNotes(row.notes)
  const base = structured && typeof structured === 'object' ? { ...structured } : {}
  if (plainComment && (base.comment === undefined || base.comment === '')) base.comment = plainComment
  return base
}

function isYesValue(v) {
  return String(v || '').trim().toLowerCase() === 'yes'
}

/**
 * Insert NV auto-actions from patched template + inspection_answers (incl. packed notes).
 * @param {import('@vercel/postgres').Sql} sql
 * @param {{ inspectionId: string, inspection: object, templateVersion: object, answersRows: object[] }} ctx
 */
export async function createNeighbourhoodVoiceAutoActions(sql, ctx) {
  const { inspectionId, inspection, templateVersion, answersRows } = ctx
  const estateId = inspection.estate_id || null
  const sections = Array.isArray(templateVersion?.sections) ? templateVersion.sections : []
  const byQ = new Map(answersRows.map((r) => [r.question_id, r]))
  let created = 0

  for (const sec of sections) {
    const sectionTitle = sec.title || sec.name || 'Section'
    for (const q of sec.questions || []) {
      if (q.nv_hidden) continue
      const row = byQ.get(q.id)
      if (!row) continue
      const ext = extrasFromAnswerRow(row)

      if (q.nv_render_kind === 'nv_standard' && q._nv_issue_category) {
        const g = gradeFromRow(row)
        const shouldD = g === 'D'
        const shouldC = g === 'C' && q._nv_create_issue_on_c
        if (!shouldD && !shouldC) continue

        const priority = shouldD ? q._nv_default_priority_d || 'medium' : q._nv_default_priority_c || 'low'
        const comment = String(ext.comment || '').trim()
        const title = `${q.resident_wording || q.question_text || 'Inspection'} — grade ${g}`
        const description = [comment || `Graded ${g}`, q._nv_issue_type ? `Issue type: ${q._nv_issue_type}` : '']
          .filter(Boolean)
          .join('\n')

        const recipient = await resolveIssueRoutingRecipient(sql, {
          issueCategory: q._nv_issue_category,
          issueType: q._nv_issue_type,
          estateId,
          assignToRoleFallback: q._nv_suggested_team_role,
        })

        const actionId = `action_${inspectionId}_${q.id}_${Date.now()}_${created}`
        await sql`
          INSERT INTO actions (
            id, inspection_id, section_id, section_name, question_id,
            category, priority, title, description, location, status,
            comment, recipient_person_id, auto_created, photo_urls
          )
          VALUES (
            ${actionId}, ${inspectionId}, ${sec.id}, ${sectionTitle}, ${q.id},
            ${q._nv_issue_category}, ${priority}, ${title}, ${description}, null, 'open',
            ${comment || null}, ${recipient?.personId || null}, true, '[]'::jsonb
          )
        `
        created += 1
      }

      if (q.nv_render_kind === 'nv_issues_report') {
        for (const line of NV_Q24_SUBISSUES) {
          const yn = ext[line.ext_yes_no_field]
          if (!isYesValue(yn)) continue
          const detail = String(ext[line.ext_detail_field] || '').trim()
          const comment = String(ext.comment || '').trim()
          const title = `${line.label} — Yes`
          const description = [detail, comment].filter(Boolean).join('\n\n') || title

          const recipient = await resolveIssueRoutingRecipient(sql, {
            issueCategory: line.issue_category,
            issueType: line.issue_type,
            estateId,
            assignToRoleFallback: line.suggested_team_role,
          })

          const actionId = `action_${inspectionId}_${q.id}_${line.sub_key}_${Date.now()}_${created}`
          await sql`
            INSERT INTO actions (
              id, inspection_id, section_id, section_name, question_id,
              category, priority, title, description, location, status,
              comment, recipient_person_id, auto_created, photo_urls
            )
            VALUES (
              ${actionId}, ${inspectionId}, ${sec.id}, ${sectionTitle}, ${q.id},
              ${line.issue_category}, ${line.default_priority || 'medium'}, ${title}, ${description}, null, 'open',
              ${comment || detail || null}, ${recipient?.personId || null}, true, '[]'::jsonb
            )
          `
          created += 1
        }
      }
    }
  }

  return created
}
