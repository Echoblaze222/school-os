// src/app/api/cron/unread-digest/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Vercel/cron-job.org Cron Job — runs hourly.
// Sends a single "You have N unread notifications" push to users who have
// unread items sitting in their inbox, following a professional backoff
// schedule (see lib/supabase/unread_digest.sql) instead of nagging every run:
//   1st nudge → at least 4h since their unread items started piling up
//   2nd nudge → 24h after the 1st
//   3rd nudge → 48h after the 2nd
//   4th+      → weekly, forever, until they read something
//
// This is intentionally separate from:
//   - notify.ts / pushNotify.ts   → fires INSTANTLY the moment something new
//                                    happens (an assignment posted, a result
//                                    published, etc.)
//   - /api/cron/reminders          → fires user-set ONE-OFF reminders
//     (scheduled_reminders table)   ("remind me about this at 6pm")
// This route is the re-engagement nudge: "you still haven't looked."
//
// Configure on whichever scheduler you're using (Vercel Cron or
// cron-job.org) to hit this URL once per hour:
//   GET https://<your-app>.vercel.app/api/cron/unread-digest
//   Header: Authorization: Bearer <CRON_SECRET>
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendPushToUsers } from '@/lib/webpush'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// How long an unread notification has to sit before it's eligible to
// trigger a nudge at all — avoids nudging someone 2 minutes after a
// notification lands, before they've had any real chance to see it.
const MIN_UNREAD_AGE_MS = 30 * 60 * 1000 // 30 minutes

export async function GET(req: Request) {
  // Verify cron secret — same convention as /api/cron/reminders
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()
  const now = new Date()
  const unreadCutoff = new Date(now.getTime() - MIN_UNREAD_AGE_MS).toISOString()

  // 1. Find every user with at least one unread notification old enough
  //    to count, grouped with their oldest unread timestamp and count.
  const { data: unreadRows, error: unreadErr } = await admin
    .from('notifications')
    .select('user_id, created_at')
    .eq('is_read', false)
    .lte('created_at', unreadCutoff)

  if (unreadErr) {
    console.error('[cron/unread-digest] unread fetch error:', unreadErr.message)
    return NextResponse.json({ error: unreadErr.message }, { status: 500 })
  }

  if (!unreadRows?.length) {
    return NextResponse.json({ ok: true, nudged: 0, reason: 'no eligible unread notifications' })
  }

  // Aggregate per user in JS (small result sets — this table is scoped to
  // a school's user base, not global; fine to aggregate here rather than
  // adding a Postgres view for it).
  const perUser = new Map<string, { count: number; oldest: string }>()
  for (const row of unreadRows) {
    const existing = perUser.get(row.user_id)
    if (!existing) {
      perUser.set(row.user_id, { count: 1, oldest: row.created_at })
    } else {
      existing.count++
      if (row.created_at < existing.oldest) existing.oldest = row.created_at
    }
  }

  const candidateIds = Array.from(perUser.keys())

  // 2. Pull existing backoff state for these users in one query.
  const { data: states } = await admin
    .from('unread_digest_state')
    .select('user_id, last_nudged_at, nudge_stage')
    .in('user_id', candidateIds)

  const stateByUser = new Map(
    (states ?? []).map(s => [s.user_id, s])
  )

  // 3. Filter down to users who are actually due for a nudge under the
  //    backoff schedule.
  const toNudge: { userId: string; count: number; stage: number }[] = []

  for (const userId of candidateIds) {
    const state = stateByUser.get(userId)
    const stage = state?.nudge_stage ?? 0

    if (!state || !state.last_nudged_at) {
      // Never nudged before — eligible immediately (the 30-min unread-age
      // filter above already ensures we're not nudging too eagerly).
      toNudge.push({ userId, count: perUser.get(userId)!.count, stage: 0 })
      continue
    }

    const cooldownHours =
      stage <= 0 ? 4 :
      stage === 1 ? 24 :
      stage === 2 ? 48 :
      168 // 7 days — settles here for anyone still ignoring it

    const elapsedMs = now.getTime() - new Date(state.last_nudged_at).getTime()
    if (elapsedMs >= cooldownHours * 60 * 60 * 1000) {
      toNudge.push({ userId, count: perUser.get(userId)!.count, stage })
    }
  }

  if (!toNudge.length) {
    return NextResponse.json({ ok: true, nudged: 0, reason: 'all candidates within cooldown' })
  }

  // 4. Send the push, one per user, then advance their backoff stage.
  let nudged = 0

  for (const { userId, count, stage } of toNudge) {
    const title = count === 1
      ? 'You have 1 unread notification'
      : `You have ${count} unread notifications`

    const body = count === 1
      ? "Something's waiting for you in SchoolOS."
      : "Don't miss what's waiting for you in SchoolOS."

    try {
      await sendPushToUsers([userId], {
        title,
        body,
        url: '/dashboard',
        tag: 'unread-digest', // shares a tag so repeated nudges replace, not stack
      })

      await admin.from('unread_digest_state').upsert({
        user_id:        userId,
        last_nudged_at: now.toISOString(),
        nudge_stage:    stage + 1,
        updated_at:     now.toISOString(),
      })

      nudged++
    } catch (err) {
      console.error(`[cron/unread-digest] push failed for user ${userId}:`, err)
      // Don't advance their stage if the push itself failed — try again
      // next run rather than silently skipping them for a week.
    }
  }

  return NextResponse.json({ ok: true, nudged, candidates: candidateIds.length })
}
