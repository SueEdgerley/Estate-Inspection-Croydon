const TRACE_PREFIX = '[access-trace]'

function isTracePath(pathname = '') {
  const path = String(pathname || '')
  return (
    path.startsWith('/api/actions') ||
    path.startsWith('/actions') ||
    path.startsWith('/api/inspections') ||
    path.startsWith('/inspections') ||
    path.startsWith('/api/reports') ||
    path.startsWith('/reports') ||
    path.includes('action-plan')
  )
}

export function getRequestTrace(request) {
  const url = request?.url ? new URL(request.url) : null
  const headers = request?.headers
  return {
    path: url?.pathname || '',
    method: request?.method || '',
    vercel_id: headers?.get?.('x-vercel-id') || headers?.get?.('x-vercel-request-id') || null,
    deployment_url: headers?.get?.('x-vercel-deployment-url') || null,
  }
}

export function logAccessTrace(event, details = {}) {
  const path = details.path || details.request_path || ''
  if (!isTracePath(path)) return
  console.warn(TRACE_PREFIX, event, details)
}

export function roleTrace(roleCtx) {
  if (!roleCtx || typeof roleCtx !== 'object') return {}
  return {
    resolved_role: roleCtx.normalized || '',
    system_role: roleCtx.systemRole || '',
    job_title: roleCtx.jobTitle || '',
    raw_system_role: roleCtx.rawSystemRole || roleCtx.raw || null,
    raw_job_title: roleCtx.rawJobTitle || null,
    clerk_is_admin: roleCtx.clerkIsAdmin === true,
  }
}

export function templateTrace(template) {
  if (!template || typeof template !== 'object') return {}
  return {
    template_id: template.id || template.template_id || null,
    template_key: template.template_key || template.key || null,
    template_name: template.name || template.template_name || null,
    template_type: template.template_type || template.type || null,
  }
}
