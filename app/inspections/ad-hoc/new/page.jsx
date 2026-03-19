import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LegacyAdHocNewPage() {
  redirect('/inspections?create=ad_hoc')
}
