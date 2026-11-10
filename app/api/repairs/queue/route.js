import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppRoleContextForClerkUser } from '@/lib/app-role-access'
import { isRepairsContactAccess } from '@/lib/repairs-contact-rules'
import {
  listRepairsQueue,
  repairsMailboxError,
  resolveRepairsMailbox,
} from '@/lib/repairs-contact-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  await ensureDatabase()

  const roleCtx = await getAppRoleContextForClerkUser(userId)
  if (!isRepairsContactAccess(roleCtx)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const resolved = await resolveRepairsMailbox()
  const mailboxError = repairsMailboxError(resolved)
  if (mailboxError) return mailboxError

  const { searchParams } = new URL(request.url)
  const queue = await listRepairsQueue({
    mailboxId: resolved.mailbox.id,
    search: searchParams.get('q') || '',
    status: searchParams.get('status') || 'outstanding',
    raised: searchParams.get('raised') || '',
    page: searchParams.get('page'),
    pageSize: searchParams.get('pageSize'),
  })
  return NextResponse.json({
    team: { id: resolved.mailbox.id, name: resolved.mailbox.name },
    ...queue,
  })
}
