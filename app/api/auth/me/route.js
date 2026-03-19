import { resolveCurrentUserAccess } from '@/lib/permissions'

export async function GET() {
  const access = await resolveCurrentUserAccess()
  return Response.json({
    userId: access?.clerkUserId ?? null,
    isAuthenticated: Boolean(access?.isAuthenticated),
    appRole: access?.appRole ?? null,
    denialCode: access?.denialCode ?? null,
    permissions: access?.permissions ?? {
      admin: false,
      editor: false,
      dashboard: false,
      templates: false,
      canCreateAdHocInspection: false,
      canCreateScheduledInspection: false,
    },
  })
}
