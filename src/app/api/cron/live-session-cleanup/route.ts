// src/app/api/cron/live-session-cleanup/route.ts
// Configure in vercel.json (or cron-job.org, given this project's existing
// missing-vercel.json workaround — see /areas/schoolos cron history):
// { "path": "/api/cron/live-session-cleanup", "schedule": "*/30 * * * *" }
//
// Safety net for "stale sessions remaining permanently live" (Phase 1
// requirement). Normally room_finished (webhook) or /api/live/end (host
// action) sets is_live=false. This exists for the gap in between: a
// teacher's device crashes, the network drops permanently, or a webhook
// delivery is lost — LiveKit will eventually empty-timeout and close the
// room server-side regardless, but online_classes.is_live could be left
// showing "live" in SchoolOS for longer than is reasonable, blocking the
// unique constraint from letting that class start a new session and
// showing students a class as joinable when it likely isn't.
//
// Deliberately conservative: only sweeps sessions that have been "live"
// for longer than any real class period plausibly runs, not a tight
// window that could race a legitimately long session.
//
// Protected by CRON_SECRET env var (same pattern as every other
// /api/cron/* route in this codebase).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { endLiveClassRoom } from '@/lib/liveClass/livekit'

const STALE_AFTER_HOURS = 6

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString()

  const { data: stale, error } = await admin
    .from('online_classes')
    .select('id, school_id, started_at')
    .eq('is_live', true)
    .eq('provider', 'livekit')
    .lt('started_at', cutoff)

  if (error) {
    console.error('[cron/live-session-cleanup] fetch error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let closed = 0
  const closedIds: string[] = []

  for (const row of stale ?? []) {
    try {
      // Best-effort — the LiveKit room is very likely already gone
      // (that's usually WHY the session went stale in the first place);
      // this just covers the rarer case where it's somehow still open.
      await endLiveClassRoom(row.school_id, row.id)
    } catch (err) {
      console.error(`[cron/live-session-cleanup] deleteRoom failed for ${row.id}:`, (err as Error).message)
    }

    const { error: updateErr } = await admin
      .from('online_classes')
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('is_live', true)

    if (!updateErr) {
      closed++
      closedIds.push(row.id)
    }
  }

  return NextResponse.json({ ok: true, checked: stale?.length ?? 0, closed, closedIds })
}
