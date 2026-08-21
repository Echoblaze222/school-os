// src/app/api/public/stats/route.ts
// Real platform counts for the landing page stats strip. No invented or
// placeholder numbers: if the platform genuinely has zero publicly listed
// schools today, this returns zero and the landing page hides that
// section rather than display a hollow stat.
//
// Phase 4, Lane I (§63) addition: cached at the edge, but deliberately
// NOT rate-limited like its /api/public/schools siblings - there are no
// query parameters here for a caller to vary to force a cache bypass
// (unlike a search endpoint, which can always be hit with a new `q` on
// every request), so a long shared cache window already gives this
// endpoint the same protection a per-IP limiter would, with less
// overhead for what's a purely decorative landing-page number.

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicPlatformStats } from '@/lib/publicSchools'

export async function GET() {
  try {
    const stats = await getPublicPlatformStats(createAdminClient())
    return NextResponse.json(
      stats,
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } }
    )
  } catch (err) {
    console.error('[api/public/stats] failed:', err)
    // Non-critical decorative data: fail soft with zeros rather than a 500
    // that would show an error state for a landing page stats strip.
    return NextResponse.json({ schoolsOnPlatform: 0, schoolsPubliclyListed: 0 })
  }
}
