// src/app/api/cron/reminders/route.ts
// Vercel Cron Job - intended to fire every minute (see vercel.json note
// below). Protected by CRON_SECRET env var (set in Vercel dashboard).
//
// ANDROID FIX: this route used to duplicate its own copy of the Web-Push-
// only send logic (select endpoint/p256dh/auth, call webpush.sendNotification
// unconditionally) instead of using the shared sendPushToUsers() in
// lib/webpush.ts - the same platform-blind bug fixed there, just copy-pasted
// here instead of shared. An android/FCM subscription (p256dh/auth = null)
// would throw, get silently swallowed, and never fire - permanently, for
// every reminder, on every Android device. Delegating to sendPushToUsers
// both fixes that (it already branches on platform) and removes the
// duplicate implementation, matching what api/cron/unread-digest already
// does correctly.
//
// NOT YET SCHEDULED: this path was never added to vercel.json's crons
// array (see the note there), so as of this fix it still won't run
// automatically until that's wired up - see DESIGN_AUDIT.md / the Android
// push finding for the schedule-frequency decision that's blocking that.

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendPushToUsers } from '@/lib/webpush'

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
    // sendPushToUsers looks up this user's subscriptions itself (web and
    // android alike) and is a no-op if there are none - no need to
    // pre-fetch subscriptions here the way this route used to.
    await sendPushToUsers([reminder.user_id], {
      title: reminder.title,
      body:  reminder.body,
      url:   reminder.url,
      tag:   `reminder-${reminder.id}`,
    })

    // Mark as fired regardless (even if no subscriptions found)
    await admin
      .from('scheduled_reminders')
      .update({ fired: true })
      .eq('id', reminder.id)

    fired++
  }

  return NextResponse.json({ ok: true, fired })
}
