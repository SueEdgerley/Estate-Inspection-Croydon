import { NextResponse } from 'next/server'
import { getTemplates, normalizeTemplate } from '@/lib/airtable-client'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getAppRoleContextForClerkUser, filterTemplatesForAppRole } from '@/lib/app-role-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch templates from Airtable
export async function GET() {
  try {
    const { userId } = await auth()
    const cu = userId ? await currentUser() : null
    const templates = await getTemplates()
    const normalized = templates.map(normalizeTemplate)
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    const allowed = filterTemplatesForAppRole(normalized, {
      userId,
      systemRole: roleCtx.systemRole,
      jobTitle: roleCtx.jobTitle,
      clerkIsAdmin: roleCtx.clerkIsAdmin,
    })
    
    return NextResponse.json(allowed)
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates', details: error.message },
      { status: 500 }
    )
  }
}
