// src/app/api/admission/schools/route.ts
// Public platform (Phase 4, Lane C) - §40 school discovery for admissions.
// Deliberately unauthenticated (listed in middleware PUBLIC_PATHS): a
// visitor must be able to see which schools are taking applications
// before they're asked to create an account. RLS on admission_settings
// already restricts this to is_enabled = true rows regardless of who's
// asking, so there's no separate authorization check needed here - the
// anon client physically cannot see disabled schools' settings.
//
// Phase 4, Lane I (§63) additions: rate-limited by caller IP (this is the
// one write-adjacent-cost public endpoint in Lane C that had no limiter -
// unlike /api/auth/self-register and /api/admission/applications, which
// already had one) and marked cacheable so a discovery-traffic spike
// hits the CDN, not this query, on every repeat visitor.
// §51 addition: verified_status now included per school so the
// public listing can show a VerificationBadge without a second request.
// (Reads Lane B's canonical schools.verified_status - see
// VerificationBadge.tsx for why this isn't the column Lane G originally
// shipped.)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(req: Request) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const ip = getClientIp(req)

  const limit = await checkRateLimit(adminSupabase, 'public_school_search', ip, 60, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.errorResponse!.error },
      { status: limit.errorResponse!.status, headers: limit.errorResponse!.retryAfter ? { 'Retry-After': String(limit.errorResponse!.retryAfter) } : undefined }
    )
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim().slice(0, 100) ?? ''

  let query = supabase
    .from('admission_settings')
    .select(`
      school_id,
      application_deadline,
      admission_fee,
      admission_fee_currency,
      requires_interview,
      requires_assessment,
      schools:school_id ( id, name, city, state, logo_url, primary_color, verified_status )
    `)
    .eq('is_enabled', true)
    .limit(50)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let results = data ?? []
  if (q) {
    const needle = q.toLowerCase()
    results = results.filter((r: any) =>
      r.schools?.name?.toLowerCase().includes(needle) ||
      r.schools?.city?.toLowerCase().includes(needle) ||
      r.schools?.state?.toLowerCase().includes(needle)
    )
  }

  // Short public cache: a spike in discovery traffic should hit this
  // layer, not re-run the query (and definitely not compete with
  // school operational dashboards for DB connections) on every request.
  // 60s is short enough that a school flipping is_enabled off is never
  // stale for long.
  return NextResponse.json(
    { schools: results },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
  )
}
