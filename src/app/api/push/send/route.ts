// src/app/api/push/send/route.ts
// Internal route — sends a single Web Push to one subscription.
// Called by fire_pending_reminders() pg function via pg_net.
// Protected by x-internal-secret header.

import { NextResponse } from 'next/server'
import webpush from 'web-push'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL ?? 'admin@schoolos.app'}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: Request) {
  // Verify internal secret
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
