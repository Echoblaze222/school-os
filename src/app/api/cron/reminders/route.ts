// src/app/api/cron/reminders/route.ts
// Vercel Cron Job — fires every minute.
// Configure in vercel.json:
// {
//   "crons": [{ "path": "/api/cron/reminders", "schedule": "* * * * *" }]
// }
// Protected by CRON_SECRET env var (set in Vercel dashboard).

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import webpush from 'web-push'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL ?? 'admin@schoolos.app'}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: Request) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()

  // Fetch all pending reminders due now
  const { data: reminders, error } = await admin
    .from('scheduled_reminders')
    .select('*')
    .eq('fired', false)
    .lte('fire_at', new Date().toISOString())
    .limit(100)

  if (error) {
    console.error('[cron/reminders] fetch error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!reminders?.length) {
    return NextResponse.json({ ok: true, fired: 0 })
  }

  let fired = 0

  for (const reminder of reminders) {
    // Get all push subscriptions for this user
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', reminder.user_id)

    if (subs?.length) {
      const payload = JSON.stringify({
        title: reminder.title,
        body:  reminder.body,
        url:   reminder.url,
        tag:   `reminder-${reminder.id}`,
        icon:  '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
      })

      // Send to all user's devices
      await Promise.allSettled(
        subs.map(sub =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          ).catch(err => {
            // 410 = subscription expired — clean it up
            if (err.statusCode === 410) {
              admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
          })
        )
      )
    }

    // Mark as fired regardless (even if no subscriptions found)
    await admin
      .from('scheduled_reminders')
      .update({ fired: true })
      .eq('id', reminder.id)

    fired++
  }

  return NextResponse.json({ ok: true, fired })
}
