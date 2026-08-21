// src/app/api/public/reports/route.ts
// Phase 4, Lane G (§52 admission fraud/safety, §62 public content
// moderation). Deliberately does not require authentication - see
// content_reports table comment in
// sql/lane-g-h-i-verification-content-security.sql for why. Rate-limited
// per caller IP so this can't be used to flood the review queue or as a
// way to probe which IDs exist (every request gets the same generic
// success response regardless of whether target_id is real).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const TARGET_TYPES = ['school', 'admission_application', 'school_promotion', 'content_post']
const REASONS = [
  'fake_school', 'impersonation', 'fake_admission_offer',
  'fraudulent_payment_request', 'spam', 'misleading_claims',
  'inappropriate_content', 'copyright_violation', 'fake_achievement', 'other',
]

export async function POST(req: Request) {
  const adminSupabase = createAdminClient()
  const ip = getClientIp(req)

  // 5 reports per IP per 10 minutes - generous for a genuine user flagging
  // something concerning, tight enough to stop the queue being flooded.
  const limit = await checkRateLimit(adminSupabase, 'public_report_submit', ip, 5, 600)
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.errorResponse!.error }, { status: limit.errorResponse!.status })
  }

  const body = await req.json().catch(() => null)
  const { target_type, target_id, reason, details, reporter_contact } = body ?? {}

  if (!TARGET_TYPES.includes(target_type)) {
    return NextResponse.json({ error: 'Invalid report target.' }, { status: 400 })
  }
  if (typeof target_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(target_id)) {
    return NextResponse.json({ error: 'Invalid target id.' }, { status: 400 })
  }
  if (!REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Invalid report reason.' }, { status: 400 })
  }
  if (details && (typeof details !== 'string' || details.length > 2000)) {
    return NextResponse.json({ error: 'Details are too long.' }, { status: 400 })
  }

  // Try to attach the caller's identity if they happen to be signed in -
  // never required, purely optional context for the review queue.
  let reporterProfileId: string | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const { data } = await adminSupabase.auth.getUser(authHeader.replace('Bearer ', ''))
    reporterProfileId = data?.user?.id ?? null
  }

  const { error } = await adminSupabase.from('content_reports').insert({
    target_type,
    target_id,
    reason,
    details: details ? String(details).slice(0, 2000) : null,
    reporter_profile_id: reporterProfileId,
    reporter_contact: reporter_contact ? String(reporter_contact).slice(0, 200) : null,
  })

  if (error) {
    console.error('[public/reports] insert failed:', error.message)
    return NextResponse.json({ error: "Couldn't submit your report right now. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Thanks - our team will review this.' }, { status: 201 })
}
