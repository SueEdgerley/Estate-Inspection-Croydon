import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getTemplates, getTemplateSections, normalizeTemplate, normalizeSection } from '@/lib/airtable-client'
import { getAppRoleContextForClerkUser, roleMayCreateInspectionWithTemplate } from '@/lib/app-role-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch sections for a template
export async function GET(request, { params }) {
  try {
    const { templateId } = await params
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templates = (await getTemplates()).map(normalizeTemplate)
    const template = templates.find((t) => t.id === templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(
      userId,
      cu?.publicMetadata?.isAdmin === true,
      { ...cu?.publicMetadata, ...cu?.privateMetadata, ...cu?.unsafeMetadata }
    )
    if (!roleMayCreateInspectionWithTemplate(roleCtx.normalized, roleCtx.clerkIsAdmin, template)) {
      return NextResponse.json({ error: 'Forbidden: your role cannot access this form template' }, { status: 403 })
    }
    
    const sections = await getTemplateSections(templateId)
    const normalized = sections.map(normalizeSection)
    
    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error fetching sections:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sections', details: error.message },
      { status: 500 }
    )
  }
}
