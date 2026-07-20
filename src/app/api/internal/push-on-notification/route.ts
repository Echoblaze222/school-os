// src/app/api/internal/push-on-notification/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Internal route — called automatically by a Postgres trigger (see
// lib/supabase/notifications_push_trigger.sql) the instant a row is
// inserted into `notifications`, from ANYWHERE: server API routes, client
// components, admin tooling, everything. This guarantees every notification
// fires an instant push, without relying on every call site remembering to
// call pushNotify()/notifyRoles() manually.
//
// Protected the same way api/push/send/route.ts already is — an
// x-internal-secret header checked against INTERNAL_SECRET — since this
// endpoint is only ever meant to be hit by the database itself via pg_net,
// never by a browser or an authenticated user session.
//
// This is the instant-push counterpart to /api/cron/unread-digest (the
// hourly "you still haven't read this" re-engagement nudge) and to
// /api/cron/reminders (user-set one-off reminders). Three distinct jobs:
//   - THIS route      → instant, the moment a notification is created
//   - unread-digest    → hourly, re-engagement for stuff sitting unread
//   - cron/reminders   → one-off, user-scheduled ("remind me at 6pm")
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { sendPushToUsers } from '@/lib/webpush'

export async function POST(req: Request) {
  // Verify internal secret — same convention as api/push/send/route.ts
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { user_id, title, body, url, tag } = await req.json()

  if (!user_id || !title) {
    return NextResponse.json({ error: 'Missing user_id or title' }, { status: 400 })
  }

  try {
    await sendPushToUsers([user_id], {
      title,
      body: body ?? '',
      url:  url  ?? '/dashboard',
      tag:  tag  ?? 'schoolos',
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[internal/push-on-notification] error:', err.message)
    // Don't fail loudly — the trigger fires this fire-and-forget from
    // Postgres and shouldn't roll back the notifications insert itself
    // just because push delivery had a hiccup.
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
