import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl, getNeonQuery } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { getAppRoleContextForClerkUser, mayViewInspectionReports } from '@/lib/app-role-access'
import {
  buildInspectionWhereConditions,
  joinSqlAnd,
  aliasInspectionWhereClause,
} from '@/lib/inspection-filters'
import { calendarQuarterToRange } from '@/lib/inspection-report-quarter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Match dashboard: unscoped listing until estate scoping is enforced. */
const TEMPORARILY_DISABLE_ESTATE_SCOPING = true

async function resolveAuth() {
  const { userId } = await auth()
  if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const cu = await currentUser()
  const clerkIsAdmin = cu?.publicMetadata?.isAdmin === true
  const email =
    cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress ?? null
  try {
    await ensureClerkUserProvisioned(userId, email, {
      displayName: [cu?.firstName, cu?.lastName].filter(Boolean).join(' ').trim() || null,
    })
  } catch (e) {
    console.warn('[reports/inspections] provision:', e?.message)
  }
  const roleCtx = await getAppRoleContextForClerkUser(userId, clerkIsAdmin)
  if (!mayViewInspectionReports(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden', code: 'REPORTS_NOT_PERMITTED' },
        { status: 403 }
      ),
    }
  }
  const userRow = await sql`
    SELECT id, email, role FROM users WHERE clerk_user_id = ${userId} LIMIT 1
  `
  const internalUser = userRow.rows[0] || null
  if (!internalUser) {
    return {
      error: NextResponse.json(
        { error: 'User not provisioned', code: 'USER_NOT_PROVISIONED' },
        { status: 403 }
      ),
    }
  }
  const admin =
    roleCtx.normalized === 'admin' ||
    roleCtx.normalized === 'esm' ||
    clerkIsAdmin ||
    (internalUser.role || '').toLowerCase() === 'owner'
  return { userId, internalUser, admin, roleCtx }
}

function mergeExtraFilters(baseWhere, baseParams, extras) {
  let w = `(${baseWhere})`
  const p = [...baseParams]
  for (const [text, vals] of extras) {
    if (!text) continue
    const offset = p.length
    const renumbered = text.replace(/\$(\d+)/g, (_, n) => `$${offset + parseInt(n, 10)}`)
    w += ` AND (${renumbered})`
    p.push(...vals)
  }
  return [w, p]
}

export async function GET(request) {
  const authRes = await resolveAuth()
  if (authRes.error) return authRes.error

  await ensureDatabase()
  const pgUrl = getPgUrl()
  if (!pgUrl) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const optionsOnly = searchParams.get('optionsOnly') === '1'

  if (optionsOnly) {
    try {
      const run = getNeonQuery()
      const [areasR, estatesR, blocksR, typesR, templatesR] = await Promise.all([
        run(
          `SELECT DISTINCT NULLIF(TRIM(area), '') AS area
           FROM estates
           WHERE NULLIF(TRIM(COALESCE(area, '')), '') IS NOT NULL
           ORDER BY 1`
        ),
        run(
          `SELECT id, name, NULLIF(TRIM(COALESCE(area, '')), '') AS area
           FROM estates
           ORDER BY name
           LIMIT 5000`
        ),
        run(
          `SELECT b.id, b.name, b.estate_id, e.name AS estate_name
           FROM blocks b
           LEFT JOIN estates e ON e.id = b.estate_id
           WHERE b.active IS DISTINCT FROM FALSE
           ORDER BY e.name NULLS LAST, b.name
           LIMIT 8000`
        ),
        run(
          `SELECT DISTINCT type FROM inspections WHERE NULLIF(TRIM(type), '') IS NOT NULL ORDER BY 1`
        ),
        run(
          `SELECT DISTINCT TRIM(template_name) AS template_name
           FROM inspections
           WHERE NULLIF(TRIM(template_name), '') IS NOT NULL
           ORDER BY 1
           LIMIT 500`
        ),
      ])
      return NextResponse.json({
        areas: (areasR.rows || []).map((r) => r.area).filter(Boolean),
        estates: estatesR.rows || [],
        blocks: blocksR.rows || [],
        types: (typesR.rows || []).map((r) => r.type).filter(Boolean),
        templateNames: (templatesR.rows || []).map((r) => r.template_name).filter(Boolean),
      })
    } catch (e) {
      console.error('[reports/inspections] options:', e)
      return NextResponse.json({ error: 'Failed to load filter options', details: e.message }, { status: 500 })
    }
  }

  let dateFrom = (searchParams.get('dateFrom') || '').trim()
  let dateTo = (searchParams.get('dateTo') || '').trim()
  const quarter = searchParams.get('quarter') || ''
  const year = searchParams.get('year') || ''
  if (quarter && year) {
    const r = calendarQuarterToRange(year, quarter)
    if (r) {
      dateFrom = r.dateFrom
      dateTo = r.dateTo
    }
  }

  const area = (searchParams.get('area') || '').trim()
  const estateId = (searchParams.get('estateId') || '').trim()
  const blockId = (searchParams.get('blockId') || '').trim()
  const type = searchParams.get('type') || 'all'
  const templateName = searchParams.get('templateName') || ''
  const inspectionStatus = searchParams.get('status') || 'submitted'
  const locationSearch = searchParams.get('locationSearch') || ''

  const conditions = buildInspectionWhereConditions({
    completionScope: 'all',
    inspectionStatus,
    dateFrom,
    dateTo,
    type,
    templateName: templateName && templateName !== 'all' ? templateName : '',
    template: 'all',
    locationSearch,
    admin: authRes.admin,
    fallbackInspectorId:
      !TEMPORARILY_DISABLE_ESTATE_SCOPING && !authRes.admin ? authRes.internalUser.email : null,
  })

  const [coreWhere, coreParams] = joinSqlAnd(conditions)
  const aliasedCore = aliasInspectionWhereClause(coreWhere, 'i')
  const extras = []
  if (area && area !== 'all') {
    extras.push([
      `lower(trim(coalesce(e.area, ''))) = lower(trim($1))`,
      [area],
    ])
  }
  if (estateId && estateId !== 'all') {
    extras.push([`i.estate_id = $1`, [estateId]])
  }
  if (blockId && blockId !== 'all') {
    extras.push([`i.block_id = $1`, [blockId]])
  }
  const [whereSql, whereParams] = mergeExtraFilters(aliasedCore, coreParams, extras)

  const fromSql = `
    FROM inspections i
    LEFT JOIN estates e ON e.id = i.estate_id
    LEFT JOIN blocks b ON b.id = i.block_id
    WHERE ${whereSql}
  `

  const run = getNeonQuery()

  try {
    const totalR = await run(`SELECT COUNT(*)::int AS total ${fromSql}`, whereParams)
    const total = parseInt(totalR.rows[0]?.total ?? 0, 10) || 0

    const byAreaR = await run(
      `SELECT COALESCE(NULLIF(TRIM(e.area), ''), 'Unspecified') AS area, COUNT(*)::int AS count
       ${fromSql}
       GROUP BY 1
       ORDER BY count DESC, area ASC`,
      whereParams
    )

    const byLocationR = await run(
      `SELECT COALESCE(NULLIF(TRIM(b.name), ''), NULLIF(TRIM(e.name), ''), NULLIF(TRIM(i.location_label), ''), 'Unknown') AS label,
              COUNT(*)::int AS count
       ${fromSql}
       GROUP BY 1
       ORDER BY count DESC, label ASC
       LIMIT 200`,
      whereParams
    )

    const byTemplateR = await run(
      `SELECT COALESCE(NULLIF(TRIM(i.template_name), ''), '(no template name)') AS template_name, COUNT(*)::int AS count
       ${fromSql}
       GROUP BY 1
       ORDER BY count DESC, template_name ASC`,
      whereParams
    )

    const byTypeR = await run(
      `SELECT COALESCE(NULLIF(TRIM(i.type), ''), 'unknown') AS type, COUNT(*)::int AS count
       ${fromSql}
       GROUP BY 1
       ORDER BY count DESC, type ASC`,
      whereParams
    )

    let rowsLimit = parseInt(searchParams.get('rowLimit') || '2500', 10)
    if (!Number.isFinite(rowsLimit) || rowsLimit < 1) rowsLimit = 2500
    rowsLimit = Math.min(rowsLimit, 5000)
    const rowLimParam = whereParams.length + 1
    const rowsR = await run(
      `SELECT
         i.id,
         i.status,
         i.type,
         i.template_name,
         NULLIF(TRIM(COALESCE(e.area, '')), '') AS area,
         e.name AS estate_name,
         b.name AS block_name,
         i.location_label,
         i.submitted_at,
         i.created_at
       ${fromSql}
       ORDER BY COALESCE(i.submitted_at, i.created_at) DESC NULLS LAST
       LIMIT $${rowLimParam}`,
      [...whereParams, rowsLimit]
    )

    const quarterMeta =
      quarter && year ? calendarQuarterToRange(year, quarter) : null

    return NextResponse.json({
      total,
      byArea: byAreaR.rows || [],
      byLocation: byLocationR.rows || [],
      byTemplate: byTemplateR.rows || [],
      byType: byTypeR.rows || [],
      rows: rowsR.rows || [],
      applied: {
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        quarter: quarterMeta?.quarter ?? null,
        year: quarterMeta?.year ?? null,
        area: area || null,
        estateId: estateId || null,
        blockId: blockId || null,
        type: type !== 'all' ? type : null,
        templateName: templateName && templateName !== 'all' ? templateName : null,
        inspectionStatus,
        locationSearch: locationSearch || null,
      },
    })
  } catch (e) {
    console.error('[reports/inspections] query:', e)
    return NextResponse.json(
      { error: 'Report query failed', details: e.message },
      { status: 500 }
    )
  }
}
