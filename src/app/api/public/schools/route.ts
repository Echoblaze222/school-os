// src/app/api/public/schools/route.ts
// Public school discovery (§39). Unauthenticated, read-only, paginated.
//
// Uses the service-role client + an explicit safe-column allowlist
// (see src/lib/publicSchools.ts) rather than letting the browser query
// `schools` directly: the same reasoning as the existing
// /api/schools/search route, extended with the discovery filters §39 asks
// for (location, education level, boarding/day, verified-only).
//
// Phase 4, Lane I (§63) addition: rate-limited by caller IP and cached at
// the edge, reusing the same checkRateLimit()/getClientIp() helpers
// already relied on elsewhere on the public platform (this endpoint's own
// sibling, the inquiries route, already used these - this route hadn't
// yet). This is the highest-traffic read on the whole public platform
// (backs the landing page's featured schools and the full /find-schools
// directory), so it's the one most worth protecting from a spike.

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchPublicSchools } from '@/lib/publicSchools'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(request: Request) {
  try {
    const admin = createAdminClient()
    const ip = getClientIp(request)

    const limit = await checkRateLimit(admin, 'public_school_directory_read', ip, 120, 60)
    if (!limit.allowed) {
      const r = limit.errorResponse!
      return NextResponse.json({ error: r.error }, {
        status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined,
      })
    }

    const url = new URL(request.url)
    const params = url.searchParams

    const limitParam = params.get('limit')
    const offsetParam = params.get('offset')

    const { schools, total } = await searchPublicSchools(admin, {
      q: params.get('q') ?? undefined,
      state: params.get('state') ?? undefined,
      schoolType: params.get('type') ?? undefined,
      educationLevel: params.get('level') ?? undefined,
      boarding: (params.get('boarding') as 'boarding' | 'day' | 'both' | null) ?? undefined,
      verifiedOnly: params.get('verified') === 'true',
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined,
    })

    return NextResponse.json(
      { schools, total },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch (err) {
    console.error('[api/public/schools] search failed:', err)
    return NextResponse.json(
      { error: 'Could not load schools right now. Please try again shortly.' },
      { status: 500 }
    )
  }
}
