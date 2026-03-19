import { requireEditorPageAccess } from '@/lib/page-access'

export const dynamic = 'force-dynamic'

export default async function ReportsLayout({ children }) {
  await requireEditorPageAccess()
  return children
}
