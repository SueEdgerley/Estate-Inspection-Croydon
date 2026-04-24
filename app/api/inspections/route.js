import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { createHash } from 'crypto'
import { ensureDatabase, getPgUrl, getNeonQuery } from '@/lib/db'
import { getTemplatesNested } from '@/lib/airtable-client'
import { getCurrentUserEmail, getCurrentUserName, isAdmin } from '@/lib/auth'
import { generatePosterPdfBuffer } from '../../../lib/poster-pdf'
import { uploadInspectionPdfToBlob } from '@/lib/blob/uploadPdf'
import { validateInspectionEstateAndBlock } from '@/lib/validate-inspection-estate-block'
import { deriveInspectionGrading } from '@/lib/deriveInspectionGrading'
import {
  isEstateWalkaboutTemplate,
  ESTATE_WALKABOUT_CHECKLIST_QID,
  getCanonicalEstateWalkaboutTemplateForInsert,
} from '@/lib/estate-walkabout-template'
import { createEstateWalkaboutActionsFromPayload } from '@/lib/estate-walkabout-actions'
import {
  tryGenerateAndStoreIssueJobCardPdf,
  formatDateGb,
} from '@/lib/issue-job-card-upload'
import { buildInspectionWhereConditions, joinSqlAnd } from '@/lib/inspection-filters'
import {
  getAppRoleContextForClerkUser,
  roleMayCreateAdHocInspection,
  roleMayCreateInspectionWithTemplate,
} from '@/lib/app-role-access'
import { summarizeTemplateSnapshotForDebug } from '@/lib/template-version-debug'
import { isEstateInspectionFormTemplate } from '@/lib/standard-inspection-form'
import {
  countQuestionsInTemplate,
  logInspectionQuestionPipeline,
} from '@/lib/estate-inspection-question-pipeline-diag'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseDueDateInput(raw) {
  if (raw == null || raw === '') return null
  const d = raw instanceof Date ? raw : new Date(typeof raw === 'string' ? raw : String(raw))
  return Number.isNaN(d.getTime()) ? null : d
}

function mapSnapshotQuestion(q, qIndex) {
  return {
    id: q.id,
    question_key: q.question_key ?? q.id,
    order: q.order ?? qIndex + 1,
    sort_order: q.sort_order ?? q.order ?? qIndex + 1,
    label: q.label ?? q.question_text ?? null,
    question_text: q.question_text ?? q.label,
    resident_wording: q.resident_wording ?? null,
    helper_text: q.helper_text ?? null,
    instructions: q.instructions ?? null,
    question_type: q.question_type ?? null,
    question_type_raw: q.question_type_raw ?? null,
    answer_mode: q.answer_mode ?? q.question_type ?? null,
    options: q.options ?? null,
    grading_scheme_name: q.grading_scheme_name ?? null,
    grading_options: q.grading_options ?? null,
    comment_required_when: q.comment_required_when ?? null,
    photo_required_when: q.photo_required_when ?? null,
    type_includes_photo: q.type_includes_photo ?? false,
    include_photo: !!(q.include_photo ?? false),
    is_required: q.is_required ?? false,
    category: q.category ?? null,
    action_category: q.action_category ?? q.category ?? null,
    create_action_on_no: q.create_action_on_no ?? true,
    require_comment_on_no: q.require_comment_on_no ?? true,
    require_photo_on_no: q.require_photo_on_no ?? true,
    triggers_task: q.triggers_task ?? false,
    triggers_email: q.triggers_email ?? false,
    email_routing: q.email_routing ?? null,
    email_route_team_id: q.email_route_team_id ?? null,
    issue_type: q.issue_type ?? null,
    programme_tag: q.programme_tag ?? null,
    depends_on_question_id: q.depends_on_question_id ?? null,
    show_when_value: q.show_when_value ?? null,
  }
}

function buildTemplateVersionSnapshot(template) {
  const questionsFlat = []
  const sections = (template.sections || []).map((sec, secIndex) => {
    const mappedQs = (sec.questions || []).map((q, qIndex) => {
      const row = mapSnapshotQuestion(q, qIndex)
      questionsFlat.push({ ...row, section_id: String(sec.id) })
      return row
    })
    return {
      id: sec.id,
      order: sec.order ?? secIndex + 1,
      title: sec.title ?? sec.name,
      name: sec.name ?? sec.title ?? null,
      help_text: sec.help_text ?? null,
      what_to_look_for: sec.what_to_look_for ?? null,
      questions: mappedQs,
    }
  })
  return {
    id: template.id,
    name: template.name,
    template_key: template.template_key ?? null,
    template_type: template.template_type ?? template.type ?? null,
    sections,
    questions: questionsFlat,
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(stableStringify(snapshot)).digest('hex')
}

async function getOrCreateTemplateVersion(templateId, templateName, snapshot) {
  const versionHash = hashSnapshot(snapshot)
  /** Reuse only when the **most recently created** row for this template_id has the same hash (stableStringify of snapshot). */
  const latest = await sql`
    SELECT id, snapshot, version_hash
    FROM template_versions
    WHERE template_id = ${templateId}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `
  if (latest.rows[0] && latest.rows[0].version_hash === versionHash) {
    return { id: latest.rows[0].id, snapshot: latest.rows[0].snapshot, versionHash, reused: true }
  }

  const versionId = `tv_${templateId}_${Date.now()}_${versionHash.slice(0, 8)}`
  await sql`
    INSERT INTO template_versions (id, template_id, template_name, version_hash, snapshot)
    VALUES (${versionId}, ${templateId}, ${templateName || null}, ${versionHash}, ${JSON.stringify(snapshot)}::jsonb)
  `
  return { id: versionId, snapshot, versionHash, reused: false }
}

export async function GET(request) {
  const { userId } = await auth()
  console.log('auth userId', userId)
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const userEmail = await getCurrentUserEmail()
    const clerkAdmin = await isAdmin()
    // Align with /api/dashboard: owner|admin|esm (and Clerk admin) see all rows.
    let postgresListAll = false
    try {
      const roleRow = await sql`
        SELECT lower(trim(role)) AS r FROM users WHERE clerk_user_id = ${userId} LIMIT 1
      `
      const r = roleRow.rows[0]?.r || ''
      postgresListAll = r === 'owner' || r === 'admin' || r === 'esm'
    } catch {
      postgresListAll = false
    }
    const canListAll = clerkAdmin || postgresListAll
    const { searchParams } = new URL(request.url)
    const fallbackInspectorId =
      !canListAll && typeof userEmail === 'string' && userEmail.trim()
        ? userEmail.trim()
        : null

    const whereConditions = buildInspectionWhereConditions({
      completionScope: searchParams.get('completionScope') || 'active',
      dateField: searchParams.get('dateField') || null,
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
      type: searchParams.get('type') || 'all',
      template: searchParams.get('template') || 'all',
      inspector: searchParams.get('inspector') || 'all',
      scheduled: searchParams.get('scheduled') || 'all',
      grading: searchParams.get('grading') || 'all',
      locationSearch: searchParams.get('search') || '',
      admin: canListAll,
      fallbackInspectorId,
    })
    const [whereText, whereParams] = joinSqlAnd(whereConditions)
    const limit = canListAll ? 200 : 100
    const limitPlaceholder = whereParams.length + 1
    const result = await getNeonQuery()(
      `SELECT i.id, i.type, i.location_label, i.inspector_name, i.inspector_id, i.template_id, i.template_name,
             i.due_date, i.submitted_at, i.grading, i.pdf_url, i.full_pdf_url, i.poster_pdf_url, i.pdf_generation_error,
             i.status, i.is_scheduled, i.title, i.source, i.description, i.created_at, i.updated_at,
             e.name AS estate_name, b.name AS block_name,
             (SELECT COUNT(*)::int FROM actions a WHERE a.inspection_id = i.id) AS issues_count
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE ${whereText}
      ORDER BY i.submitted_at DESC NULLS LAST, i.created_at DESC
      LIMIT $${limitPlaceholder}`,
      [...whereParams, limit]
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error listing inspections:', error)
    return NextResponse.json(
      { error: 'Failed to list inspections', details: error?.message },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  const { userId } = await auth()
  console.log('auth userId', userId)
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body && body.test === true) {
    return NextResponse.json({
      ok: true,
      message: 'POST /api/inspections reachable',
      userId,
    })
  }

  const {
    template_id,
    title,
    location,
    description,
    due_date,
    estate_id: bodyEstateId,
    block_id: bodyBlockId,
    answers = {},
    answer_extras = {},
    draft: createDraft,
  } = body

  const dueDateParsed = parseDueDateInput(due_date)

  const rawSource = body?.source
  const sourceValue =
    typeof rawSource === 'string' && rawSource.trim().length > 0
      ? rawSource.trim().slice(0, 50)
      : null

  const inspectionTypeRaw =
    typeof body?.inspection_type === 'string' ? body.inspection_type.trim().toLowerCase() : ''
  const isAdHocCreate =
    body?.ad_hoc === true || inspectionTypeRaw === 'ad_hoc'

  if (isAdHocCreate) {
    if (!getPgUrl()) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const titleTrimmed =
      typeof title === 'string' && title.trim() ? title.trim() : ''
    if (!titleTrimmed) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const inspectorEmail = await getCurrentUserEmail()
    const inspectorName = await getCurrentUserName()
    const adHocSource = sourceValue ?? 'ad_hoc'

    try {
      await ensureDatabase()
      const cu = await currentUser()
      const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
      if (!roleMayCreateAdHocInspection(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
        return NextResponse.json(
          { error: 'Forbidden: your role cannot create ad-hoc inspections' },
          { status: 403 }
        )
      }
      const loc = await validateInspectionEstateAndBlock(bodyEstateId, bodyBlockId)
      if (!loc.ok) {
        return NextResponse.json({ error: loc.message }, { status: loc.status })
      }
      const estateId = loc.estateId
      const blockId = loc.blockId
      const inspectionId = crypto.randomUUID()
      const locationLabel =
        location && String(location).trim() ? String(location).trim() : null
      const desc =
        description && String(description).trim() ? String(description).trim() : null
      const adHocSnapshot = {
        id: 'ad_hoc',
        name: 'Ad Hoc Inspection',
        template_type: 'ad_hoc',
        sections: [],
      }
      const adHocVersion = await getOrCreateTemplateVersion('ad_hoc', 'Ad Hoc Inspection', adHocSnapshot)

      await sql`
        INSERT INTO inspections (
          id, legacy_inspection_id, type, title, description, location_label, due_date,
          template_id, template_name, template_version_id, template_version, status, submitted_at, created_at, updated_at,
          inspector_id, inspector_name, estate_id, block_id, source
        )
        VALUES (
          ${inspectionId},
          NULL,
          'ad_hoc',
          ${titleTrimmed},
          ${desc},
          ${locationLabel},
          ${dueDateParsed},
          NULL,
          NULL,
          ${adHocVersion.id},
          ${JSON.stringify(adHocVersion.snapshot)}::jsonb,
          'draft',
          NULL,
          ${new Date()},
          ${new Date()},
          ${inspectorEmail || null},
          ${inspectorName || null},
          ${estateId},
          ${blockId},
          ${adHocSource}
        )
      `
      return NextResponse.json({ inspectionId, id: inspectionId }, { status: 201 })
    } catch (error) {
      console.error('Error creating ad hoc inspection:', error)
      return NextResponse.json(
        { error: 'Failed to create inspection', details: error.message },
        { status: 500 }
      )
    }
  }

  const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY
  if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
    return NextResponse.json(
      { error: 'Airtable not configured. Set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY).' },
      { status: 503 }
    )
  }

  if (!template_id) {
    return NextResponse.json(
      { error: 'template_id is required' },
      { status: 400 }
    )
  }

  if (!getPgUrl()) {
    return NextResponse.json(
      { error: 'Database not configured. Please set up Postgres.' },
      { status: 503 }
    )
  }

  const inspectorEmail = await getCurrentUserEmail()
  const inspectorName = await getCurrentUserName()

  try {
    const nested = await getTemplatesNested()
    let template = nested.find((t) => t.id === template_id)
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 400 }
      )
    }
    if (isEstateWalkaboutTemplate(template)) {
      template = getCanonicalEstateWalkaboutTemplateForInsert(template)
    }

    if (isEstateInspectionFormTemplate(template)) {
      logInspectionQuestionPipeline('inspection_create_live_template_from_getTemplatesNested', {
        template_id: template.id,
        template_name: template.name,
        ...countQuestionsInTemplate(template),
      })
    }

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    if (!roleMayCreateInspectionWithTemplate(roleCtx.normalized, roleCtx.clerkIsAdmin, template)) {
      return NextResponse.json(
        { error: 'Forbidden: your role cannot use this form template' },
        { status: 403 }
      )
    }

    await ensureDatabase()
    const loc = await validateInspectionEstateAndBlock(bodyEstateId, bodyBlockId)
    if (!loc.ok) {
      return NextResponse.json({ error: loc.message }, { status: loc.status })
    }
    const estateId = loc.estateId
    const blockId = loc.blockId
    const inspectionId = crypto.randomUUID()
    const snapshot = buildTemplateVersionSnapshot(template)
    if (isEstateInspectionFormTemplate(template)) {
      logInspectionQuestionPipeline('template_version_snapshot_built_for_insert', {
        template_id: template.id,
        template_name: template.name,
        ...countQuestionsInTemplate(snapshot),
      })
    }
    const templateVersion = await getOrCreateTemplateVersion(template_id, template.name || null, snapshot)
    if (isEstateInspectionFormTemplate(template)) {
      logInspectionQuestionPipeline('template_version_after_getOrCreate', {
        template_id: template.id,
        template_version_id: templateVersion.id,
        reused: templateVersion.reused,
        version_hash_prefix: templateVersion.versionHash?.slice(0, 12) ?? null,
        ...countQuestionsInTemplate(templateVersion.snapshot),
      })
    }
    const inspectionRowType = isEstateWalkaboutTemplate(template) ? 'estate_walkabout' : 'inspection'

    // Draft-only: create inspection with status 'draft' for wizard flow (e.g. Neighbourhood Voice)
    if (createDraft === true) {
      const displayTitle = (typeof title === 'string' && title.trim())
        ? title.trim()
        : [template.name, location && String(location).trim()].filter(Boolean).join(' – ') || inspectionId.slice(0, 8)
      await sql`
        INSERT INTO inspections (
          id, legacy_inspection_id, type, title, description, location_label, due_date,
          template_id, template_name, template_version_id, template_version, status, submitted_at, created_at, updated_at,
          inspector_id, inspector_name, estate_id, block_id, source
        )
        VALUES (
          ${inspectionId},
          NULL,
          ${inspectionRowType},
          ${displayTitle},
          ${description && String(description).trim() ? String(description).trim() : null},
          ${location && String(location).trim() ? String(location).trim() : null},
          ${dueDateParsed},
          ${template_id},
          ${template.name || null},
          ${templateVersion.id},
          ${JSON.stringify(templateVersion.snapshot)}::jsonb,
          'draft',
          NULL,
          ${new Date()},
          ${new Date()},
          ${inspectorEmail || null},
          ${inspectorName || null},
          ${estateId},
          ${blockId},
          ${sourceValue}
        )
      `
      return NextResponse.json(
        {
          inspectionId,
          templateVersionId: templateVersion.id,
          templateVersionHash: templateVersion.versionHash,
          templateVersionReused: templateVersion.reused,
          snapshotDebug: summarizeTemplateSnapshotForDebug(templateVersion.snapshot),
          ...(isEstateInspectionFormTemplate(template)
            ? {
                questionPipelineDebug: {
                  live_getTemplatesNested: countQuestionsInTemplate(template),
                  persisted_template_version: countQuestionsInTemplate(templateVersion.snapshot),
                  templateVersionReused: templateVersion.reused,
                  template_version_id: templateVersion.id,
                },
              }
            : {}),
        },
        { status: 201 }
      )
    }

    const displayTitle = (typeof title === 'string' && title.trim())
      ? title.trim()
      : [template.name, location && String(location).trim()].filter(Boolean).join(' – ') || inspectionId.slice(0, 8)

    const gradingValue = deriveInspectionGrading(template, answers)

    await sql`
      INSERT INTO inspections (
        id, legacy_inspection_id, type, title, description, location_label, due_date,
        template_id, template_name, template_version_id, template_version, status, submitted_at, created_at, updated_at,
        inspector_id, inspector_name, estate_id, block_id, source, grading
      )
      VALUES (
        ${inspectionId},
        NULL,
        ${inspectionRowType},
        ${displayTitle},
        ${description && String(description).trim() ? String(description).trim() : null},
        ${location && String(location).trim() ? String(location).trim() : null},
        ${dueDateParsed},
        ${template_id},
        ${template.name || null},
        ${templateVersion.id},
        ${JSON.stringify(templateVersion.snapshot)}::jsonb,
        'submitted',
        ${new Date()},
        ${new Date()},
        ${new Date()},
        ${inspectorEmail || null},
        ${inspectorName || null},
        ${estateId},
        ${blockId},
        ${sourceValue},
        ${gradingValue}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location_label = EXCLUDED.location_label,
        due_date = EXCLUDED.due_date,
        template_id = EXCLUDED.template_id,
        template_name = EXCLUDED.template_name,
        template_version_id = EXCLUDED.template_version_id,
        template_version = EXCLUDED.template_version,
        status = EXCLUDED.status,
        submitted_at = EXCLUDED.submitted_at,
        inspector_id = COALESCE(EXCLUDED.inspector_id, inspections.inspector_id),
        inspector_name = COALESCE(EXCLUDED.inspector_name, inspections.inspector_name),
        estate_id = COALESCE(EXCLUDED.estate_id, inspections.estate_id),
        block_id = COALESCE(EXCLUDED.block_id, inspections.block_id),
        source = COALESCE(EXCLUDED.source, inspections.source),
        grading = COALESCE(EXCLUDED.grading, inspections.grading),
        updated_at = ${new Date()}
    `

    const questionsById = new Map()
    template.sections.forEach((sec) => {
      ;(sec.questions || []).forEach((q) => questionsById.set(q.id, { ...q, sectionId: sec.id }))
    })

    // Persist answers into Postgres inspection_answers (system of record)
    try {
      for (const [questionId, answer] of Object.entries(answers)) {
          if (answer === undefined || answer === null) continue
          const question = questionsById.get(questionId)
          if (!question) continue
          const extras = answer_extras[questionId] || {}
          const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''

          const questionType = question.question_type || 'text'
          const rawValue = typeof answer === 'string' ? answer : String(answer)
          const lower = String(answer).toLowerCase()
          const answerBoolean =
            questionType === 'yes_no'
              ? (lower === 'yes' ? true : lower === 'no' ? false : null)
              : null
          const asNumber = Number(answer)
          const answerNumber =
            questionType === 'number' && Number.isFinite(asNumber) ? asNumber : null

          const answerId = `answer_${inspectionId}_${questionId}`

          // Base columns only (matches POST /api/inspections/[id]/answers). Phase-2 routing columns
          // (triggers_task, etc.) require migration 20250302000000; omit so inserts work on init schema.
          await sql`
            INSERT INTO inspection_answers (
              id, inspection_id, section_id, question_id, question_type,
              answer_value, answer_text, answer_number, answer_boolean, notes
            )
            VALUES (
              ${answerId},
              ${inspectionId},
              ${question.sectionId},
              ${questionId},
              ${questionType},
              ${rawValue},
              ${rawValue},
              ${answerNumber},
              ${answerBoolean},
              ${comment || null}
            )
            ON CONFLICT (inspection_id, question_id) DO UPDATE SET
              answer_value = EXCLUDED.answer_value,
              answer_text = EXCLUDED.answer_text,
              answer_number = EXCLUDED.answer_number,
              answer_boolean = EXCLUDED.answer_boolean,
              notes = EXCLUDED.notes,
              updated_at = CURRENT_TIMESTAMP
          `
        }
    } catch (answersErr) {
      console.error('[Inspections] Could not persist inspection answers to Postgres:', answersErr)
    }

    // Store photos in inspection_photos for PDF/noticeboard pipeline
    try {
      for (const [questionId, answer] of Object.entries(answers)) {
          if (answer === undefined || answer === null) continue
          const extras = answer_extras[questionId] || {}
          const urls = Array.isArray(extras.photo_urls)
            ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
            : Array.isArray(extras.photoUrls)
              ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
              : []
          const singleUrl = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
          const allUrls = singleUrl ? [singleUrl, ...urls] : urls
          for (let i = 0; i < allUrls.length; i++) {
            const url = allUrls[i]
            const photoId = `photo_${inspectionId}_${questionId}_${Date.now()}_${i}`
            await sql`
              INSERT INTO inspection_photos (id, inspection_id, question_id, blob_url, blob_key, filename)
              VALUES (${photoId}, ${inspectionId}, ${questionId}, ${url}, null, null)
            `
          }
      }
    } catch (photoErr) {
      console.warn('[Inspections] Could not store photos for PDF pipeline:', photoErr.message)
    }

    // Estate Walkabout: photos embedded in checklist JSON (per item)
    if (isEstateWalkaboutTemplate(template)) {
      try {
        const raw = answers[ESTATE_WALKABOUT_CHECKLIST_QID]
        const s = typeof raw === 'string' ? raw.trim() : ''
        if (s) {
          const parsed = JSON.parse(s)
          const items = Array.isArray(parsed) ? parsed : []
          let idx = 0
          for (const item of items) {
            const urls = Array.isArray(item?.photo_urls)
              ? item.photo_urls.filter((u) => typeof u === 'string' && u.trim())
              : []
            for (const url of urls) {
              const photoId = `photo_${inspectionId}_ewchk_${idx++}_${Date.now()}`
              await sql`
                INSERT INTO inspection_photos (id, inspection_id, question_id, blob_url, blob_key, filename)
                VALUES (${photoId}, ${inspectionId}, ${ESTATE_WALKABOUT_CHECKLIST_QID}, ${url}, null, null)
              `
            }
          }
        }
      } catch (ewPhotoErr) {
        console.warn('[Inspections] Estate walkabout checklist photos:', ewPhotoErr.message)
      }
      try {
        const estNameRes = await sql`SELECT name FROM estates WHERE id = ${estateId} LIMIT 1`
        const estateName = estNameRes.rows[0]?.name || ''
        await createEstateWalkaboutActionsFromPayload(sql, {
          inspectionId,
          estateName,
          template,
          answers,
          answer_extras,
          inspectorName,
          inspectorEmail,
          locationLine: displayTitle,
          submittedAt: new Date().toISOString(),
          inspectionTypeLabel: template.name || '',
        })
      } catch (ewActErr) {
        console.warn('[Inspections] Estate walkabout actions:', ewActErr.message)
      }
    }

    const actionsForPoster = []
    let emailGroupsByTeam = null

    for (const section of template.sections || []) {
      for (const q of section.questions || []) {
        const answer = answers[q.id]
        if (answer === undefined || answer === null) continue
        const extras = answer_extras[q.id] || {}
        const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
        const photoUrlsArr = Array.isArray(extras.photo_urls)
          ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
          : Array.isArray(extras.photoUrls)
            ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
            : []
        const photoUrlSingle = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
        const allPhotoUrls = photoUrlSingle ? [photoUrlSingle, ...photoUrlsArr] : photoUrlsArr

        const isNo = String(answer).toLowerCase() === 'no'
        const isIssue = isNo || (String(answer).toLowerCase() === 'yes' && comment)
        const residentMessage = comment || q.question_text || 'Issue raised from inspection'
        const category = q.action_category || q.category || 'Follow-up'

        if (isNo && q.create_action_on_no) {
          try {
            const actionId = `action_${inspectionId}_${q.id}_${Date.now()}`
            await sql`
              INSERT INTO actions (
                id, inspection_id, section_id, section_name, question_id,
                category, priority, title, description, location, status,
                comment, auto_created, photo_urls
              )
              VALUES (
                ${actionId}, ${inspectionId}, ${section.id}, ${section.title}, ${q.id},
                ${category}, null, ${residentMessage}, ${residentMessage}, null, 'open',
                ${comment || null}, true, ${JSON.stringify(allPhotoUrls)}
              )
            `
            actionsForPoster.push({
              id: actionId,
              category,
              title: residentMessage,
              description: residentMessage,
              comment: comment || null,
              photo_urls: allPhotoUrls,
              created_at: new Date(),
            })
            try {
              const locLine = displayTitle || String(location || '').trim() || '—'
              const pdfR = await tryGenerateAndStoreIssueJobCardPdf(sql, {
                actionId,
                inspectionId,
                inspectionType: template.name || 'Inspection',
                blockEstate: locLine,
                location: locLine,
                exactLocation: locLine,
                dateRaised: formatDateGb(new Date()),
                dateSent: formatDateGb(new Date()),
                issueTitle: residentMessage,
                issueType: String(category || 'Issue').replace(/_/g, ' '),
                issueDetail: [q.question_text || q.label, comment].filter(Boolean).join('\n\n').slice(0, 2500),
                priority: 'As reported',
                assignedTeam: '—',
                targetCompletionDate: 'TBC',
                jobNumber: 'Pending assignment',
                status: 'Open',
                photoUrls: allPhotoUrls,
              })
              if (!pdfR?.ok) {
                console.warn('[Inspections] Issue job card PDF:', actionId, pdfR?.error)
              }
            } catch (issuePdfErr) {
              console.warn('[Inspections] Issue job card PDF failed:', issuePdfErr?.message || issuePdfErr)
            }
          } catch (pgErr) {
            console.warn('[Inspections] Could not create Postgres action for poster:', pgErr.message)
          }
        }

        if (isIssue && q.triggers_task) {
          try {
            const taskId = `task_${inspectionId}_${q.id}_${Date.now()}`
            await sql`
              INSERT INTO tasks (id, inspection_id, question_id, category, issue_type, programme_tag, description, status)
              VALUES (${taskId}, ${inspectionId}, ${q.id}, ${q.category || category}, ${q.issue_type || null}, ${q.programme_tag || null}, ${residentMessage}, 'open')
            `
          } catch (taskErr) {
            console.warn('[Inspections] Could not create task:', taskErr.message)
          }
        }

        if (isIssue && q.triggers_email) {
          // Collect for grouping by team (done below)
          if (!emailGroupsByTeam) emailGroupsByTeam = new Map()
          const teamKey = (q.email_route_team_id && String(q.email_route_team_id).trim()) || `_q_${q.id}`
          const emailTo = (q.email_routing && String(q.email_routing).trim()) || inspectorEmail || ''
          if (!emailGroupsByTeam.has(teamKey)) {
            emailGroupsByTeam.set(teamKey, { emailTo, questionIds: [] })
          }
          const entry = emailGroupsByTeam.get(teamKey)
          entry.questionIds.push(q.id)
          if (emailTo) entry.emailTo = emailTo
        }
      }
    }

    // Create one outbound_email row per team (grouped by email_route_team_id)
    if (emailGroupsByTeam) {
      for (const [teamKey, { emailTo, questionIds }] of emailGroupsByTeam) {
        try {
          const isTeam = !teamKey.startsWith('_q_')
          const emailId = `email_${inspectionId}_${teamKey.replace(/\W/g, '_')}_${Date.now()}`
          const toAddress = emailTo || (isTeam ? teamKey : '')
          await sql`
            INSERT INTO outbound_emails (id, inspection_id, question_id, email_to, email_routing, status)
            VALUES (${emailId}, ${inspectionId}, ${questionIds[0] || null}, ${toAddress || 'pending'}, ${isTeam ? teamKey : null}, 'pending')
          `
          if (toAddress) {
            await sql`UPDATE outbound_emails SET sent_at = CURRENT_TIMESTAMP, status = 'sent' WHERE id = ${emailId}`
          }
        } catch (emailErr) {
          console.warn('[Inspections] Could not log outbound email:', emailErr.message)
        }
      }
    }

    const fullPdfUrl = null
    let posterPdfUrl = null
    let pdfErrorMessage = null
    try {
      const inspectionForPoster = {
        id: inspectionId,
        title: displayTitle,
        location_label: location || null,
        submitted_at: new Date(),
        inspector_name: inspectorName || '',
      }
      if (actionsForPoster.length > 0) {
        const posterPdfBytes = await generatePosterPdfBuffer(inspectionForPoster, actionsForPoster)
        posterPdfUrl = await uploadInspectionPdfToBlob({
          inspectionId,
          pdfBytes: posterPdfBytes,
          kind: 'poster',
        })
      }

      await sql`
        UPDATE inspections 
        SET poster_pdf_url = COALESCE(${posterPdfUrl}, poster_pdf_url),
            pdf_generation_error = ${pdfErrorMessage}
        WHERE id = ${inspectionId}
      `
    } catch (pdfErr) {
      pdfErrorMessage = pdfErr?.message || String(pdfErr)
      console.error('[Inspections] Error generating poster PDF:', pdfErr)
      try {
        const truncated =
          pdfErrorMessage.length > 2000 ? pdfErrorMessage.slice(0, 2000) : pdfErrorMessage
        await sql`
          UPDATE inspections
          SET pdf_generation_error = ${truncated}
          WHERE id = ${inspectionId}
        `
      } catch (updErr) {
        console.error('[Inspections] Could not persist pdf_generation_error:', updErr)
      }
    }

    return NextResponse.json({
      inspectionId,
      id: inspectionId,
      templateVersionId: templateVersion.id,
      templateVersionHash: templateVersion.versionHash,
      templateVersionReused: templateVersion.reused,
      snapshotDebug: summarizeTemplateSnapshotForDebug(templateVersion.snapshot),
      ...(isEstateInspectionFormTemplate(template)
        ? {
            questionPipelineDebug: {
              live_getTemplatesNested: countQuestionsInTemplate(template),
              persisted_template_version: countQuestionsInTemplate(templateVersion.snapshot),
              templateVersionReused: templateVersion.reused,
              template_version_id: templateVersion.id,
            },
          }
        : {}),
      pdfUrl: fullPdfUrl || undefined,
      fullPdfUrl: fullPdfUrl || undefined,
      posterPdfUrl: posterPdfUrl || undefined,
      ...(pdfErrorMessage ? { pdfError: pdfErrorMessage } : {}),
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating inspection:', error)
    return NextResponse.json(
      { error: 'Failed to create inspection', details: error.message },
      { status: 500 }
    )
  }
}
