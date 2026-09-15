// src/lib/webpush.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Web Push helper. This is the canonical home for sendPushToUsers.
//
// Why this file exists (fixes audit #104):
//   `sendPushToUsers` previously lived inside `app/api/push/send/route.ts` and
//   was imported from `lib/pushNotify.ts`. Importing a function from a
//   `route.ts` file is an anti-pattern in the Next.js App Router - it can pull
//   the Node-only `web-push` module into bundles/runtimes where it doesn't
//   belong and breaks the route's module contract (route files should only
//   export HTTP method handlers + route config).
//
//   `sendPushToUsers` now lives here. Both `app/api/push/send/route.ts` and
//   `lib/pushNotify.ts` import it from this file instead.
//
// ANDROID FIX: this function is the single funnel every DB-triggered
// notification goes through (see api/internal/push-on-notification and
// api/cron/unread-digest) - "nothing can skip it, because it's not opt-in,
// it's a DB-level side effect of the insert itself" (docs/lane3-notifications/
// 00-LANE3-REPORT.md). Despite that, until this fix it only ever selected
// `endpoint, p256dh, auth` and unconditionally called webpush.sendNotification
// for every row - including android/FCM rows, which have p256dh/auth = null
// (see docs/phase5-lane-mobile-sql/01-push-subscriptions-fcm.sql). Every
// android subscription would throw here, get swallowed by the catch below,
// and never match the 410/404 check, so it would neither deliver nor get
// pruned - a silent, permanent no-op for every Android user on the app's
// main notification path. Now splits subscriptions by platform and routes
// android rows to sendFcmToTokens (lib/fcm.ts) instead.
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendFcmToTokens } from '@/lib/fcm'

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
 * Send a push notification to one or more users, on whatever platform(s)
 * each user has registered - Web Push and/or Android (FCM). Looks up each
 * user's stored push subscriptions, sends to all of them, and prunes any
 * subscription the platform reports as expired/revoked/unregistered.
 *
 * Safe to call even if neither platform is configured, or no subscriptions
 * exist - resolves without throwing in every case. Web and Android are
 * independently optional: if only one is configured, the other's rows are
 * simply skipped rather than blocking the whole call.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!userIds.length) return

  const admin = adminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id, platform, fcm_token')
    .in('user_id', userIds)

  if (!subs?.length) return

  // WHATSAPP FIX: previously defaulted to a single static tag ('schoolos') when
  // a caller didn't pass one. Android/Chrome collapses same-tag notifications
  // into one slot - each new push silently *replaced* the last instead of
  // showing/alerting as a new notification. WhatsApp gives every message its
  // own tag so they stack; we do the same by default. Callers that WANT
  // grouping/replacement (e.g. "3 new messages in this chat") can still pass
  // an explicit tag - renotify below ensures even that still re-alerts.
  const tag = payload.tag ?? `schoolos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const webSubs     = subs.filter(s => s.platform !== 'android')
  const androidSubs = subs.filter(s => s.platform === 'android')

  const staleEndpoints: string[] = []

  // ── Web Push branch ──────────────────────────────────────────────
  if (webSubs.length) {
    try {
      ensureVapidConfigured()

      const message = JSON.stringify({
        title:    payload.title,
        body:     payload.body,
        url:      payload.url ?? '/',
        tag,
        renotify: true, // re-alert (vibrate/sound) even if this tag is reused
        icon:     '/icons/icon-192x192.png',
        badge:    '/icons/icon-192x192.png',
      })

      await Promise.allSettled(
        webSubs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh!, auth: sub.auth! } },
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
    } catch {
      // VAPID not configured for this environment - skip web sends silently,
      // android (if any) still gets attempted below.
    }
  }

  // ── Android (FCM) branch ─────────────────────────────────────────
  if (androidSubs.length) {
    const tokens = androidSubs.map(s => s.fcm_token).filter((t): t is string => !!t)
    if (tokens.length) {
      const { staleTokens } = await sendFcmToTokens(tokens, {
        title: payload.title,
        body:  payload.body,
        url:   payload.url ?? '/',
        tag,
      })
      const staleSet = new Set(staleTokens)
      const freshEndpoints: string[] = []
      for (const sub of androidSubs) {
        if (!sub.fcm_token) continue
        if (staleSet.has(sub.fcm_token)) staleEndpoints.push(sub.endpoint)
        else freshEndpoints.push(sub.endpoint)
      }
      if (freshEndpoints.length) {
        await admin.from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .in('endpoint', freshEndpoints)
      }
    }
  }

  if (staleEndpoints.length) {
    await admin.from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints)
  }
}
