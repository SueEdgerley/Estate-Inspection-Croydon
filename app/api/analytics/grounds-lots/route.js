import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getNeonQuery, getPgUrl } from '@/lib/db'
import { getAppRoleContextForClerkUser, mayViewManagerAnalytics } from '@/lib/app-role-access'
import { gradedAbcdSql } from '@/lib/analytics-grade-summary'
import {
  GROUNDS_LOTS,
  UNASSIGNED_LOT_ID,
  buildGroundsLotReport,
  loadGroundsMaintenanceCatalogue,
} from '@/lib/grounds-maintenance-sites'
import { GROUNDS_MAINTENANCE_TEMPLATE_ID } from '@/lib/grounds-maintenance-template'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clean(value) {
  const text = String(value || '').trim()
  return text && text.toLowerCase() !== 'all' ? text : ''
}

export async function GET(request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cu = await currentUser()
  const roleCtx = await getAppRoleContextForClerkUser(
    userId,
    cu?.publicMetadata?.isAdmin === true,
    { ...cu?.publicMetadata, ...cu?.privateMetadata, ...cu?.unsafeMetadata }
  )
  if (!mayViewManagerAnalytics(roleCtx.systemRole, roleCtx.clerkIsAdmin)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const params = request.nextUrl.searchParams
  const dateFrom = clean(params.get('from'))
  const dateTo = clean(params.get('to'))
  const inspector = clean(params.get('inspector'))
  const inspectorName = clean(params.get('inspectorName'))
  const lotId = clean(params.get('lot')) || 'all'
  const knownLot = lotId === 'all' || lotId === UNASSIGNED_LOT_ID || GROUNDS_LOTS.some((lot) => lot.id === lotId)
  if (!knownLot) return NextResponse.json({ error: 'Unknown lot' }, { status: 400 })

  try {
    const catalogue = loadGroundsMaintenanceCatalogue()
    const run = getNeonQuery()
    const column = await run(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'inspections' AND column_name = 'gm_site_id'`,
      []
    )
    const linkTable = await run(`SELECT to_regclass('public.gm_site_links') AS reg`, [])
    const siteSelect = column.rows.length > 0 ? 'i.gm_site_id' : 'NULL::text AS gm_site_id'
    const gradeToken = gradedAbcdSql('ia')

    const inspections = await run(
      `SELECT i.id,
              i.submitted_at,
              i.inspector_id,
              i.inspector_name,
              i.location_label,
              i.block_id,
              b.name AS block_name,
              i.estate_id,
              e.name AS estate_name,
              ${siteSelect}
       FROM inspections i
       LEFT JOIN blocks b ON b.id = i.block_id
       LEFT JOIN estates e ON e.id = COALESCE(i.estate_id, b.estate_id)
       WHERE lower(COALESCE(i.status, '')) = 'submitted'
         AND (
           i.template_id = $1
           OR (
             lower(COALESCE(i.template_name, '')) LIKE '%grounds maintenance%'
             AND lower(COALESCE(i.template_name, '')) NOT LIKE '%neighbourhood%'
           )
         )
         AND ($2::date IS NULL OR i.submitted_at >= $2::date)
         AND ($3::date IS NULL OR i.submitted_at < ($3::date + interval '1 day'))
         AND (
           $4::text = ''
           OR lower(trim(COALESCE(i.inspector_id, ''))) = lower($4)
           OR lower(trim(COALESCE(i.inspector_name, ''))) = lower($4)
           OR ($5::text <> '' AND lower(trim(COALESCE(i.inspector_name, ''))) = lower($5))
         )`,
      [GROUNDS_MAINTENANCE_TEMPLATE_ID, dateFrom || null, dateTo || null, inspector, inspectorName]
    )

    const ids = inspections.rows.map((row) => row.id)
    let answerRows = []
    if (ids.length > 0) {
      const answers = await run(
        `SELECT ia.inspection_id,
                COUNT(*) FILTER (WHERE ${gradeToken} = 'A')::int AS a,
                COUNT(*) FILTER (WHERE ${gradeToken} = 'B')::int AS b,
                COUNT(*) FILTER (WHERE ${gradeToken} = 'C')::int AS c,
                COUNT(*) FILTER (WHERE ${gradeToken} = 'D')::int AS d
         FROM inspection_answers ia
         WHERE ia.inspection_id = ANY($1::text[])
         GROUP BY ia.inspection_id`,
        [ids]
      )
      answerRows = answers.rows
    }
    const answersById = new Map(answerRows.map((row) => [row.inspection_id, row]))

    let links = []
    if (linkTable.rows[0]?.reg) {
      const linkResult = await run(
        `SELECT l.site_id, l.block_id, b.name AS block_name, l.estate_id, e.name AS estate_name
         FROM gm_site_links l
         LEFT JOIN blocks b ON b.id = l.block_id
         LEFT JOIN estates e ON e.id = l.estate_id`,
        []
      )
      links = (linkResult.rows || []).map((row) => ({
        siteId: row.site_id,
        blockId: row.block_id,
        blockName: row.block_name,
        estateId: row.estate_id,
        estateName: row.estate_name,
      }))
    }

    const report = buildGroundsLotReport({
      catalogue,
      links,
      lotId,
      inspections: inspections.rows.map((row) => {
        const answersForInspection = answersById.get(row.id) || {}
        return {
          id: row.id,
          gmSiteId: row.gm_site_id,
          inspectorId: row.inspector_id,
          inspectorName: row.inspector_name,
          locationLabel: row.location_label,
          blockId: row.block_id,
          blockName: row.block_name,
          estateId: row.estate_id,
          estateName: row.estate_name,
          a: answersForInspection.a,
          b: answersForInspection.b,
          c: answersForInspection.c,
          d: answersForInspection.d,
        }
      }),
    })

    return NextResponse.json({
      ...report,
      applied: { dateFrom: dateFrom || null, dateTo: dateTo || null, inspector: inspector || null, lotId },
      reviewFlags: catalogue.reviewFlags || [],
      conflictCount: (catalogue.conflicts || []).length,
    })
  } catch (error) {
    console.error('[analytics/grounds-lots]', error)
    return NextResponse.json({ error: 'Could not load Grounds Maintenance lots' }, { status: 500 })
  }
}
