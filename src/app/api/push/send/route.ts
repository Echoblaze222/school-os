// src/app/api/push/send/route.ts
// Internal route — sends a single reminder push to one subscription,
// web or android. Called by fire_pending_reminders() pg function via
// pg_net, once per due reminder × subscription row.
// Protected by x-internal-secret header.
//
// The pg function itself lives only in the live database (this repo's
// sql/ files are table-structure dumps, no function bodies, same
// no-migration-history situation as everywhere else in this repo), so
// it isn't included here. See
// docs/phase5-lane-mobile-sql/02-fire-pending-reminders-android.sql
// for the change that function needs so android rows actually reach
// this route with the right fields.

import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { sendFcmToTokens } from '@/lib/fcm'

let vapidConfigured = false
function ensureVapidConfigured() {
  if (vapidConfigured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys are not configured')
  }
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@schoolos.app'}`,
    publicKey,
    privateKey
  )
  vapidConfigured = true
}

export async function POST(req: Request) {
  // Verify internal secret
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { platform, endpoint, p256dh, auth, fcmToken, title, body, url, tag } = await req.json()

  // Android branch: one FCM token, no VAPID/webpush involved at all.
  if (platform === 'android') {
    if (!fcmToken) {
      return NextResponse.json({ error: 'Missing fcmToken' }, { status: 400 })
    }
    const { staleTokens } = await sendFcmToTokens([fcmToken], {
      title: title ?? 'SchoolOS Reminder',
      body:  body  ?? '',
      url:   url   ?? '/',
      tag:   tag   ?? 'schoolos-reminder',
    })
    if (staleTokens.length) {
      // Token was invalid/unregistered — report it the same way an
      // expired web endpoint is reported below, so pg_net's caller can
      // clean it up the same way it already does for 410s.
      return NextResponse.json({ error: 'Token not registered' }, { status: 410 })
    }
    return NextResponse.json({ ok: true })
  }

  // Web branch: unchanged from before android support existed.
  try {
    ensureVapidConfigured()
  } catch (err: any) {
    console.error('[push/send] VAPID config error:', err.message)
    return NextResponse.json({ error: 'Push not configured' }, { status: 500 })
  }

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 })
  }

  const payload = JSON.stringify({
    title: title ?? 'SchoolOS Reminder',
    body:  body  ?? '',
    url:   url   ?? '/',
    tag:   tag   ?? 'schoolos-reminder',
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
  })

  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      payload
    )
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[push/send] error:', err.message)
    // 410 Gone = subscription expired, caller should clean it up
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 500 })
  }
}
