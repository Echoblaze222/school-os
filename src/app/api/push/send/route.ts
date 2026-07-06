// src/app/api/push/send/route.ts
// Internal route — sends a single Web Push to one subscription.
// Called by fire_pending_reminders() pg function via pg_net.
// Protected by x-internal-secret header.

import { NextResponse } from 'next/server'
import webpush from 'web-push'

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

  try {
    ensureVapidConfigured()
  } catch (err: any) {
    console.error('[push/send] VAPID config error:', err.message)
    return NextResponse.json({ error: 'Push not configured' }, { status: 500 })
  }

  const { endpoint, p256dh, auth, title, body, url, tag } = await req.json()

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
