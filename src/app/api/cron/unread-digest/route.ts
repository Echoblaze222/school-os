// src/app/api/cron/unread-digest/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Vercel/cron-job.org Cron Job — runs hourly.
// Sends a SPECIFIC push to users who have unread notifications sitting in
// their inbox — not a generic "something's waiting," but e.g.:
//   "3 new assignments"              (all unread items are one type)
//   "New result posted"               (exactly one unread item — its real title)
//   "2 new messages + 3 more"         (mixed types — leads with the dominant one)
// Follows a professional backoff schedule (see lib/supabase/unread_digest.sql)
// instead of nagging every run:
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

// Same type vocabulary as NotificationsBell.tsx's TYPE_COLORS — kept in
// sync manually since one lives client-side and one server-side. Used to
// turn "3 unread" into "3 new assignments" instead of staying generic.
const TYPE_LABELS: Record<string, { singular: string; plural: string }> = {
  announcement: { singular: 'new announcement', plural: 'new announcements' },
  assignment:   { singular: 'new assignment',   plural: 'new assignments' },
  result:       { singular: 'new result',       plural: 'new results' },
  quiz:         { singular: 'new quiz',         plural: 'new quizzes' },
  chat:         { singular: 'new message',      plural: 'new messages' },
  payment:      { singular: 'payment update',   plural: 'payment updates' },
  system:       { singular: 'update',           plural: 'updates' },
}

function labelFor(type: string, count: number) {
  const l = TYPE_LABELS[type]
  if (!l) return count === 1 ? 'notification' : 'notifications'
  return count === 1 ? l.singular : l.plural
}

// How long an unread notification has to sit before it's eligible to
// trigger a nudge at all — avoids nudging someone 2 minutes after a
// notification lands, before they've had any real chance to see it.
const MIN_UNREAD_AGE_MS = 30 * 60 * 1000 // 30 minutes

interface UserUnread {
  count: number
  oldest: string
  byType: Map<string, number>
  mostRecentTitle: string
  mostRecentAt: string
  mostRecentUrl: string | null
}

export async function GET(req: Request) {
  // Verify cron secret — same convention as /api/cron/reminders
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()
  const now = new Date()
  const unreadCutoff = new Date(now.getTime() - MIN_UNREAD_AGE_MS).toISOString()

  // 1. Find every unread notification old enough to count, with enough
  //    detail (type, title) to build a specific message — not just a count.
  const { data: unreadRows, error: unreadErr } = await admin
    .from('notifications')
    .select('user_id, type, title, action_url, created_at')
    .eq('is_read', false)
    .lte('created_at', unreadCutoff)
    .order('created_at', { ascending: false })

  if (unreadErr) {
    console.error('[cron/unread-digest] unread fetch error:', unreadErr.message)
    return NextResponse.json({ error: unreadErr.message }, { status: 500 })
  }

  if (!unreadRows?.length) {
    return NextResponse.json({ ok: true, nudged: 0, reason: 'no eligible unread notifications' })
  }

  // Aggregate per user in JS (small result sets — this table is scoped to
  // a school's user base, not global; fine to aggregate here rather than
  // adding a Postgres view for it). Rows arrive newest-first, so the first
  // row seen per user is their most recent unread item.
  const perUser = new Map<string, UserUnread>()
  for (const row of unreadRows) {
    const existing = perUser.get(row.user_id)
    if (!existing) {
      const byType = new Map<string, number>([[row.type ?? 'system', 1]])
      perUser.set(row.user_id, {
        count: 1,
        oldest: row.created_at,
        byType,
        mostRecentTitle: row.title,
        mostRecentAt: row.created_at,
        mostRecentUrl: row.action_url ?? null,
      })
    } else {
      existing.count++
      if (row.created_at < existing.oldest) existing.oldest = row.created_at
      const type = row.type ?? 'system'
      existing.byType.set(type, (existing.byType.get(type) ?? 0) + 1)
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
  const toNudge: { userId: string; unread: UserUnread; stage: number }[] = []

  for (const userId of candidateIds) {
    const state = stateByUser.get(userId)
    const stage = state?.nudge_stage ?? 0
    const unread = perUser.get(userId)!

    if (!state || !state.last_nudged_at) {
      // Never nudged before — eligible immediately (the 30-min unread-age
      // filter above already ensures we're not nudging too eagerly).
      toNudge.push({ userId, unread, stage: 0 })
      continue
    }

    const cooldownHours =
      stage <= 0 ? 4 :
      stage === 1 ? 24 :
      stage === 2 ? 48 :
      168 // 7 days — settles here for anyone still ignoring it

    const elapsedMs = now.getTime() - new Date(state.last_nudged_at).getTime()
    if (elapsedMs >= cooldownHours * 60 * 60 * 1000) {
      toNudge.push({ userId, unread, stage })
    }
  }

  if (!toNudge.length) {
    return NextResponse.json({ ok: true, nudged: 0, reason: 'all candidates within cooldown' })
  }

  // 4. Send the push, one per user, then advance their backoff stage.
  let nudged = 0

  for (const { userId, unread, stage } of toNudge) {
    const { title, body, url } = composeDigestMessage(unread)

    try {
      await sendPushToUsers([userId], {
        title,
        body,
        url,
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

// ── Build a specific title/body instead of a generic "something's waiting" ──
function composeDigestMessage(unread: UserUnread): { title: string; body: string; url: string } {
  const url = unread.mostRecentUrl ?? '/dashboard'

  // Exactly one unread item — use its real title verbatim, like a normal
  // single push would, rather than wrapping it in digest language at all.
  if (unread.count === 1) {
    return {
      title: unread.mostRecentTitle,
      body:  `You haven't opened this yet.`,
      url,
    }
  }

  const typesUsed = Array.from(unread.byType.entries()) // [type, count][]
  typesUsed.sort((a, b) => b[1] - a[1]) // dominant type first

  // Every unread item is the same type — fully specific, no hedging.
  if (typesUsed.length === 1) {
    const [type, count] = typesUsed[0]
    return {
      title: `${count} ${labelFor(type, count)}`,
      body:  `Waiting for you in SchoolOS.`,
      url,
    }
  }

  // Mixed types — lead with the dominant type by name, fold the rest into
  // "and N more" rather than staying vague about all of it.
  const [dominantType, dominantCount] = typesUsed[0]
  const remaining = unread.count - dominantCount

  return {
    title: `${dominantCount} ${labelFor(dominantType, dominantCount)} + ${remaining} more`,
    body:  `You have ${unread.count} unread items across SchoolOS.`,
    url,
  }
}
