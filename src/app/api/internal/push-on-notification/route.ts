// src/app/api/internal/push-on-notification/route.ts
// -----------------------------------------------------------------------------
// Internal route - called automatically by a Postgres trigger (see
// docs/lane3-notifications/02-push-trigger.sql) the instant a row is
// inserted into `notifications`, from ANYWHERE: server API routes, client
// components, admin tooling, everything. This guarantees every notification
// fires an instant push, without relying on every call site remembering to
// call pushNotify()/notifyRoles() manually.
//
// Protected the same way api/push/send/route.ts already is - an
// x-internal-secret header checked against INTERNAL_SECRET - since this
// endpoint is only ever meant to be hit by the database itself via pg_net,
// never by a browser or an authenticated user session.
//
// This is the instant-push counterpart to /api/cron/unread-digest (the
// hourly "you still haven't read this" re-engagement nudge) and to
// /api/cron/reminders (user-set one-off reminders). Three distinct jobs:
//   - THIS route      -> instant, the moment a notification is created
//   - unread-digest   -> hourly, re-engagement for stuff sitting unread
//   - cron/reminders  -> one-off, user-scheduled ("remind me at 6pm")
//
// Hardening added here:
//   1. The secret is compared in constant time, so response timing can't be
//      used to guess it one character at a time.
//   2. The push link is only ever an in-app path. If a notification row
//      carries an outside URL, the push opens the dashboard instead.
//   3. A category the user has explicitly muted for push in
//      notification_preferences is honoured here, at the one place every
//      push passes through. No preference row means push stays on (the same
//      default notifyUser.ts uses). Security and account alerts can never be
//      muted (same list as notifyUser.ts's mandatory categories).
// -----------------------------------------------------------------------------

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendPushToUsers } from '@/lib/webpush'

// Keep in sync with MANDATORY_CATEGORIES in src/lib/notify/notifyUser.ts
const MANDATORY_CATEGORIES = new Set(['security_alert', 'account_security', 'subscription_suspended'])

function secretsMatch(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function safeInternalUrl(url: unknown): string {
  if (typeof url !== 'string') return '/dashboard'
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return '/dashboard'
  return url
}

export async function POST(req: Request) {
  // Verify internal secret - same convention as api/push/send/route.ts
  if (!secretsMatch(req.headers.get('x-internal-secret'), process.env.INTERNAL_SECRET)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { user_id, title, body, url, tag } = await req.json()

  if (!user_id || !title) {
    return NextResponse.json({ error: 'Missing user_id or title' }, { status: 400 })
  }

  try {
    // Honour an explicit per-category push mute.
    if (typeof tag === 'string' && tag && !MANDATORY_CATEGORIES.has(tag)) {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: pref } = await admin
        .from('notification_preferences')
        .select('push_enabled')
        .eq('user_id', user_id)
        .eq('category', tag)
        .maybeSingle()

      if (pref && pref.push_enabled === false) {
        return NextResponse.json({ ok: true, skipped: 'push muted for this category' })
      }
    }

    await sendPushToUsers([user_id], {
      title,
      body: body ?? '',
      url:  safeInternalUrl(url),
      tag:  tag  ?? 'schoolos',
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[internal/push-on-notification] error:', err.message)
    // Don't fail loudly - the trigger fires this fire-and-forget from
    // Postgres and shouldn't roll back the notifications insert itself
    // just because push delivery had a hiccup.
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
