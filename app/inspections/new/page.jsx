import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function NewInspectionPage() {
  // Default generic "new inspection" entry to Manage Inspections in ad hoc mode.
  redirect('/inspections?create=ad_hoc')
}
