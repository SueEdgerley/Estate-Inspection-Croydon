import { Suspense } from 'react'

export default function InspectionWizardLayout({ children }) {
  return <Suspense fallback={<div style={{ padding: 24, fontFamily: 'system-ui' }}>Loading…</div>}>{children}</Suspense>
}
