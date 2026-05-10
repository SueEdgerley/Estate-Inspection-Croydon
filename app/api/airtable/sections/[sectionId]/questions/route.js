import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getSectionQuestions, getTemplatesNested, normalizeQuestion } from '@/lib/airtable-client'
import { getAppRoleContextForClerkUser, roleMayCreateInspectionWithTemplate } from '@/lib/app-role-access'
import { getRequestTrace, logAccessTrace, roleTrace, templateTrace } from '@/lib/access-trace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch questions for a section
export async function GET(request, { params }) {
  try {
    const { sectionId } = await params
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templates = await getTemplatesNested()
    const template = templates.find((t) =>
      (t.sections || []).some((section) => section.id === sectionId)
    )
    if (!template) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(
      userId,
      cu?.publicMetadata?.isAdmin === true,
      { ...cu?.publicMetadata, ...cu?.privateMetadata, ...cu?.unsafeMetadata }
    )
    const allowed = roleMayCreateInspectionWithTemplate(roleCtx.normalized, roleCtx.clerkIsAdmin, template)
    logAccessTrace('api.airtable.section-questions.permission', {
      ...getRequestTrace(request),
      user_id: userId,
      section_id: sectionId,
      ...roleTrace(roleCtx),
      ...templateTrace(template),
      permission: 'roleMayCreateInspectionWithTemplate',
      allowed,
    })
    if (!allowed) {
      logAccessTrace('api.airtable.section-questions.forbidden', {
        ...getRequestTrace(request),
        user_id: userId,
        section_id: sectionId,
        ...roleTrace(roleCtx),
        ...templateTrace(template),
        failure_source: 'roleMayCreateInspectionWithTemplate',
      })
      return NextResponse.json({ error: 'Forbidden: your role cannot access this form template' }, { status: 403 })
    }
    
    const questions = await getSectionQuestions(sectionId)
    const normalized = questions.map(normalizeQuestion)
    
    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error fetching questions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch questions', details: error.message },
      { status: 500 }
    )
  }
}
