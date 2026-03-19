import { requireEditorPageAccess } from '@/lib/page-access'

export const dynamic = 'force-dynamic'

export default async function ActionsLayout({ children }) {
  await requireEditorPageAccess()
  return children
}
