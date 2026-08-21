// src/app/api/public/promotions/route.ts
// Lane E - public discovery feed. No auth required. Runs server-side with
// the admin client (RLS would return the same 'live' rows to anon anyway -
// see promotions_public_read_live in the migration - but selecting a fixed,
// explicit column list here means a future column added to school_promotions
// can't leak into this response by accident).
//
// Phase 4, Lane I (§63) addition: rate-limited by caller IP and cached at
// the edge for the same reason as the other public discovery endpoints.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 50)

  const supabase = createAdminClient()
  const ip = getClientIp(request)

  const rateLimit = await checkRateLimit(supabase, 'public_promotions_read', ip, 120, 60)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.errorResponse!.error }, { status: rateLimit.errorResponse!.status })
  }

  const today = new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('school_promotions')
    .select(`
      id, school_id, promotion_type, title, summary, image_url,
      external_link, placement, is_sponsored, start_date, end_date,
      schools ( name, city, state, primary_color, logo_url )
    `)
    .eq('status', 'live')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('is_sponsored', { ascending: false })
    .order('start_date', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('promotion_type', type)

  const { data, error } = await query

  if (error) {
    console.error('[public/promotions] query failed:', error.message)
    return NextResponse.json({ error: 'Couldn\'t load promotions right now.' }, { status: 500 })
  }

  // Sponsored placement must always be visibly labeled - §47: "Do not
  // mislead users into thinking sponsored content is an organic ranking."
  const promotions = (data ?? []).map((p) => ({ ...p, sponsored_label: p.is_sponsored ? 'Sponsored' : null }))

  return NextResponse.json(
    { promotions },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
  )
}
