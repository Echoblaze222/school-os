// src/app/api/public/schools/[slug]/route.ts
// Public school profile (§45). Returns the safe-column profile plus its
// upcoming public events. 404s (not 403) for unlisted/inactive/unknown
// slugs alike: the reason isn't distinguishable from outside.
//
// Phase 4, Lane I (§63) addition: rate-limited by caller IP and cached at
// the edge - same reasoning as the sibling /api/public/schools route.

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicSchoolBySlug, getPublicSchoolEvents } from '@/lib/publicSchools'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    if (!slug || slug.length > 200) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 })
    }

    const admin = createAdminClient()
    const ip = getClientIp(request)

    const limit = await checkRateLimit(admin, 'public_school_profile_read', ip, 120, 60)
    if (!limit.allowed) {
      const r = limit.errorResponse!
      return NextResponse.json({ error: r.error }, {
        status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined,
      })
    }

    const school = await getPublicSchoolBySlug(admin, slug)

    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 })
    }

    const events = await getPublicSchoolEvents(admin, school.id)

    return NextResponse.json(
      { school, events },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
    )
  } catch (err) {
    console.error('[api/public/schools/[slug]] fetch failed:', err)
    return NextResponse.json(
      { error: 'Could not load this school profile right now. Please try again shortly.' },
      { status: 500 }
    )
  }
}
