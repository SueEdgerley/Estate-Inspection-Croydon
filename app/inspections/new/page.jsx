import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function NewInspectionPage() {
  // Default generic "new inspection" entry to the ad hoc workflow.
  redirect('/inspections/ad-hoc/new')
}
