// src/app/api/internal/email-retry/route.ts
// Called on a schedule by a pg_cron job (see
// docs/lane3-notifications/03-email-retry-cron.sql) via net.http_post -
// same pattern as api/internal/push-on-notification/route.ts, including
// reusing the same INTERNAL_SECRET env var rather than introducing a
// second secret for what's functionally the same kind of call
// (Postgres calling back into this app, authenticated by a shared header).
//
// Picks up every email_deliveries row that's still 'queued' and past its
// next_attempt_at, and re-attempts each one. Runs on a schedule rather
// than being triggered by anything else, since the whole point is to
// catch sends that failed when nothing else was watching.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { retryQueuedEmail } from '@/lib/email/queueEmail'

const BATCH_SIZE = 25 // keeps each cron tick fast and bounded even if a backlog builds up

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: due, error } = await admin
    .from('email_deliveries')
    .select('id')
    .eq('status', 'queued')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ checked: 0, sent: 0, requeued: 0, failed: 0 })
  }

  let sent = 0
  let requeued = 0
  let failed = 0

  for (const row of due) {
    const result = await retryQueuedEmail(row.id)
    if (result === 'sent') sent++
    else if (result === 'queued') requeued++
    else failed++
  }

  return NextResponse.json({ checked: due.length, sent, requeued, failed })
}
