import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH() {
  return NextResponse.json(
    { error: 'Admin guide updates are disabled while the app uses the static Best Practice Guide.' },
    { status: 501 }
  )
}
