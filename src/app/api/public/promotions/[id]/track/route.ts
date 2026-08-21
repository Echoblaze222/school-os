// src/app/api/public/promotions/[id]/track/route.ts
// Lane E, §60 - records one anonymous analytics event for a live promotion.
// Deliberately collects nothing identifying: no IP, no user agent, no
// cookie. `session_ref` is an opaque client-generated string used only to
// let the client de-duplicate its own repeat impressions; it is never
// readable back out (promotion_analytics_events has no select policy) and
// is not joined against any identity table anywhere in this codebase.
//
// The RLS insert policy (promo_events_insert_if_live) independently
// re-checks that the promotion is live before accepting the row, so this
// route can't be used to fingerprint the existence/status of a
// draft/rejected promotion by watching for a 200 vs an error.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const VALID_EVENTS = [
  'impression', 'view', 'school_profile_visit', 'admission_page_visit',
  'application_start', 'application_submitted', 'event_interest',
] as const

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let body: { event_type?: string; session_ref?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.event_type || !VALID_EVENTS.includes(body.event_type as any)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
  }

  // session_ref is optional and, if present, capped hard - it must never
  // become a place to smuggle identifying data through.
  const sessionRef = typeof body.session_ref === 'string' ? body.session_ref.slice(0, 64) : null

  const supabase = createAdminClient()

  // Throttle by IP, keyed separately from the auth-takeover-oriented uses
  // of this helper. This is a low-stakes analytics endpoint - the goal is
  // just to stop one client from flooding the events table - so unlike
  // auth_code_signin we deliberately do NOT fail closed on a limiter
  // outage: losing a few analytics events during an infra hiccup is fine,
  // silently dropping real visitor traffic because the limiter DB is
  // unreachable is not a trade worth making here.
  const ip = getClientIp(req)
  const rateCheck = await checkRateLimit(supabase, 'public_promotion_track_ip', ip, 120, 60)
  if (!rateCheck.allowed && rateCheck.errorResponse?.status === 429) {
    return NextResponse.json({ ok: true }) // same response shape either way - see note below
  }

  const { error } = await supabase.from('promotion_analytics_events').insert({
    promotion_id: id,
    event_type: body.event_type,
    session_ref: sessionRef,
  })

  // Always return the same 200/{ok:true} whether the insert succeeded or
  // was rejected (e.g. the promotion isn't live, or the id doesn't exist).
  // Distinguishing the two in the response would let a caller probe for
  // the existence/status of a non-live promotion_id.
  if (error) {
    console.error('[public/promotions/track] insert rejected:', error.message)
  }
  return NextResponse.json({ ok: true })
}
