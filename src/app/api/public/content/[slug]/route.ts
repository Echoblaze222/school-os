// src/app/api/public/content/[slug]/route.ts
// Phase 4, Lane H (§54) - single published post by slug. See list route
// for the RLS/rate-limit/caching reasoning; identical here.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const ip = getClientIp(req)

  const limit = await checkRateLimit(adminSupabase, 'public_content_read', ip, 120, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.errorResponse!.error }, { status: limit.errorResponse!.status })
  }

  const { data, error } = await supabase
    .from('content_posts')
    .select('id, title, slug, author_name, category, cover_image_url, body, tags, seo_title, seo_description, publish_at, updated_at')
    .eq('slug', slug)
    .maybeSingle()

  // RLS already hides drafts/unscheduled posts from this query entirely -
  // a missing row here is indistinguishable from "not published yet" from
  // the caller's point of view, which is the correct behavior (no need to
  // leak "this exists but isn't public yet" via a different error).
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return NextResponse.json(
    { post: data },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  )
}
