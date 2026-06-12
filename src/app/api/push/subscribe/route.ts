// src/app/api/push/subscribe/route.ts
// Saves or removes a browser Web Push subscription for the current user.
// Called by the usePushNotifications hook on the client side.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ── Helpers ───────────────────────────────────────────────

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── POST /api/push/subscribe — save a subscription ───────
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subscription, oldEndpoint } = await req.json()
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()

  const admin = adminClient()

  // If this is a subscription renewal (pushsubscriptionchange event),
  // delete the old endpoint first
  if (oldEndpoint) {
    await admin.from('push_subscriptions').delete().eq('endpoint', oldEndpoint)
  }

  // Upsert by endpoint so re-subscribing the same browser doesn't create a duplicate
  const { error } = await admin.from('push_subscriptions').upsert({
    user_id:     user.id,
    school_id:   profile?.school_id ?? null,
    endpoint:    subscription.endpoint,
    p256dh:      subscription.keys.p256dh,
    auth:        subscription.keys.auth,
    user_agent:  req.headers.get('user-agent') ?? null,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE /api/push/subscribe — remove a subscription ───
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  const admin = adminClient()
  await admin.from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}

// ── GET /api/push/subscribe — check if user is subscribed ─
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ subscribed: false })

  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  return NextResponse.json({ subscribed: (data?.length ?? 0) > 0 })
}
