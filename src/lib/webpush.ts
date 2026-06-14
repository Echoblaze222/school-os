// src/lib/webpush.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Web Push helper. This is the canonical home for sendPushToUsers.
//
// Why this file exists (fixes audit #104):
//   `sendPushToUsers` previously lived inside `app/api/push/send/route.ts` and
//   was imported from `lib/pushNotify.ts`. Importing a function from a
//   `route.ts` file is an anti-pattern in the Next.js App Router — it can pull
//   the Node-only `web-push` module into bundles/runtimes where it doesn't
//   belong and breaks the route's module contract (route files should only
//   export HTTP method handlers + route config).
//
//   `sendPushToUsers` now lives here. Both `app/api/push/send/route.ts` and
//   `lib/pushNotify.ts` import it from this file instead.
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push'
import { createClient as createAdminClient } from '@supabase/supabase-js'

let vapidConfigured = false

function ensureVapidConfigured() {
  if (vapidConfigured) return

  const email      = process.env.VAPID_EMAIL
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!email || !publicKey || !privateKey) {
    throw new Error(
      'Web Push is not configured: VAPID_EMAIL, NEXT_PUBLIC_VAPID_PUBLIC_KEY and ' +
      'VAPID_PRIVATE_KEY must all be set.'
    )
  }

  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey)
  vapidConfigured = true
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface PushPayload {
  title: string
  body:  string
  url?:  string
  tag?:  string
}

/**
 * Send a Web Push notification to one or more users.
 * Looks up each user's stored push subscriptions, sends to all of them,
 * and prunes any subscriptions the browser has revoked (410/404).
 *
 * Safe to call even if VAPID env vars are missing or no subscriptions exist —
 * in both cases it resolves without throwing.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!userIds.length) return

  try {
    ensureVapidConfigured()
  } catch {
    // Push not configured for this environment — skip silently.
    return
  }

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
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
  })

  const staleEndpoints: string[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
          { TTL: 60 * 60 * 24 } // 24 hours
        )
        await admin.from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('endpoint', sub.endpoint)
      } catch (err: any) {
        // 410 Gone or 404 Not Found = subscription expired/revoked
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleEndpoints.push(sub.endpoint)
        }
      }
    })
  )

  if (staleEndpoints.length) {
    await admin.from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints)
  }
}
