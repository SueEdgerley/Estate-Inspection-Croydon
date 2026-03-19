import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ManageInspectionsAliasPage({ searchParams }) {
  const createParam =
    typeof searchParams?.create === 'string' && searchParams.create.trim()
      ? searchParams.create.trim()
      : null

  if (createParam) {
    redirect(`/inspections?create=${encodeURIComponent(createParam)}`)
  }

  redirect('/inspections')
}
