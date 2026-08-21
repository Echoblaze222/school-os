// src/app/api/public/rankings/route.ts
// Lane F, §50 - public, transparent ranking read. Always returns the
// methodology summary and data freshness alongside every score, and
// reports "insufficient data" explicitly rather than omitting a school or
// guessing a number for it.
//
// Phase 4, Lane I (§63) addition: rate-limited by caller IP and cached at
// the edge - rankings change at most once per computed period, never
// per-request, so there's no reason for a traffic spike here to touch
// the DB more than once every few minutes.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const categoryKey = searchParams.get('category')

  const supabase = createAdminClient()
  const ip = getClientIp(request)

  const limit = await checkRateLimit(supabase, 'public_rankings_read', ip, 120, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.errorResponse!.error }, { status: limit.errorResponse!.status })
  }

  const { data: categories, error: catError } = await supabase
    .from('ranking_categories')
    .select('id, key, label, description, methodology_summary, min_sample_size')
    .eq('is_active', true)
    .order('label')

  if (catError) {
    console.error('[public/rankings] category query failed:', catError.message)
    return NextResponse.json({ error: 'Couldn\'t load rankings right now.' }, { status: 500 })
  }

  const targetCategories = categoryKey
    ? (categories ?? []).filter((c) => c.key === categoryKey)
    : (categories ?? [])

  if (categoryKey && targetCategories.length === 0) {
    return NextResponse.json({ error: 'Unknown ranking category.' }, { status: 404 })
  }

  const results = await Promise.all(targetCategories.map(async (category) => {
    const { data: scores, error } = await supabase
      .from('school_ranking_scores')
      .select(`
        school_id, score, sample_size, insufficient_data, period_start,
        period_end, computed_at, methodology_version,
        schools ( name, city, state, logo_url )
      `)
      .eq('category_id', category.id)
      .order('period_end', { ascending: false })
      .order('score', { ascending: false, nullsFirst: false })

    if (error) {
      console.error('[public/rankings] score query failed:', error.message)
      return { category, scores: [] as unknown[] }
    }

    // Keep only each school's most recent period for this category.
    const seen = new Set<string>()
    const latest = (scores ?? []).filter((s) => {
      if (seen.has(s.school_id)) return false
      seen.add(s.school_id)
      return true
    })

    return { category, scores: latest }
  }))

  return NextResponse.json(
    { rankings: results },
    { headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=600' } }
  )
}
