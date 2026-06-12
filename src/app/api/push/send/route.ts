// src/app/api/push/send/route.ts
// Server-side: sends Web Push notifications.
// Used internally by other routes (e.g. when a notification is created,
// when principal broadcasts, etc.).
//
// Also accepts a POST from the principal broadcast panel directly.
//
// npm install web-push
// npm install --save-dev @types/web-push

import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Configure VAPID — these env vars must be set in .env.local and Vercel
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL!}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Exported helper — call this from other server routes ──────────────────
// e.g. sendPushToUsers(['user-uuid-1', 'user-uuid-2'], { title, body, url })
export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  if (!userIds.length) return

  const admin = adminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds)

  if (!subs?.length) return

  const message = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    url:   payload.url ?? '/',
    tag:   payload.tag ?? 'schoolos',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  })

  const staleEndpoints: string[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
          { TTL: 60 * 60 * 24 } // 24 hours TTL
        )
        // Update last_used_at
        await admin.from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('endpoint', sub.endpoint)
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired/revoked → delete it
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleEndpoints.push(sub.endpoint)
        }
      }
    })
  )

  // Clean up expired subscriptions
  if (staleEndpoints.length) {
    await admin.from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints)
  }
}

// ── POST /api/push/send — called by principal broadcast panel ─────────────
// Body: { userIds?: string[], targetRole?: string, title, body, url }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only principal or admin may call this endpoint
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['principal', 'admin', 'super-admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userIds, targetRole, title, body, url } = await req.json()

  if (!title || !body) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400 })
  }

  const admin = adminClient()
  let resolvedUserIds: string[] = userIds ?? []

  // Resolve by role if userIds not provided directly
  if (!resolvedUserIds.length && profile.school_id) {
    let q = admin
      .from('profiles')
      .select('id')
      .eq('school_id', profile.school_id)
      .eq('is_active', true)

    if (targetRole && targetRole !== 'all') {
      q = q.eq('role', targetRole)
    }

    const { data: targets } = await q
    resolvedUserIds = (targets ?? []).map((t: any) => t.id)
  }

  if (!resolvedUserIds.length) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No subscribers found' })
  }

  await sendPushToUsers(resolvedUserIds, { title, body, url: url ?? '/', tag: 'schoolos-broadcast' })

  return NextResponse.json({ ok: true, sent: resolvedUserIds.length })
}
