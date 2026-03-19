import { redirect } from 'next/navigation'
import { resolveCurrentUserAccess } from '@/lib/permissions'

async function resolveBaseAccess() {
  const access = await resolveCurrentUserAccess()
  if (!access?.isAuthenticated) {
    redirect('/login')
  }
  if (access?.denialCode) {
    redirect('/login?noAccess=1')
  }
  return access
}

export async function requireTemplatesPageAccess() {
  const access = await resolveBaseAccess()
  if (!access?.permissions?.templates) {
    redirect('/login?noAccess=1')
  }
  return access
}

export async function requireEditorPageAccess() {
  const access = await resolveBaseAccess()
  if (!access?.permissions?.dashboard) {
    redirect('/templates')
  }
  return access
}

export async function requireInspectionsPageAccess() {
  const access = await resolveBaseAccess()
  if (!access?.permissions?.inspections) {
    redirect('/templates?noInspectionsAccess=1')
  }
  return access
}

export async function requireAdminPageAccess() {
  const access = await resolveBaseAccess()
  if (!access?.permissions?.admin) {
    redirect('/templates')
  }
  return access
}
