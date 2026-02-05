'use client'

import DashboardHome from './dashboard/page'

// Render dashboard at root so "/" always works even if /dashboard route is missing in build
export default function Home() {
  return <DashboardHome />
}
