import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DashboardAuthLayout({ children }) {
  const { userId } = await auth()
  if (!userId) {
    redirect('/login')
  }
  return children
}
