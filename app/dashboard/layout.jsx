import { requireEditorPageAccess } from '@/lib/page-access'

export const dynamic = 'force-dynamic'

export default async function DashboardAuthLayout({ children }) {
  await requireEditorPageAccess()
  return children
}
