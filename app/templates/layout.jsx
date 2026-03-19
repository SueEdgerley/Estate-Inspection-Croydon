import { requireTemplatesPageAccess } from '@/lib/page-access'

export const dynamic = 'force-dynamic'

export default async function TemplatesLayout({ children }) {
  await requireTemplatesPageAccess()
  return children
}
