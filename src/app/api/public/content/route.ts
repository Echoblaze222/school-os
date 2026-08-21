// src/app/api/public/content/route.ts
// Phase 4, Lane H (§54) - public reads of official SchoolOS editorial
// content. RLS on content_posts already restricts anon/authenticated
// reads to status='published' (or 'scheduled' whose publish_at has
// passed) - see sql/lane-g-h-i-verification-content-security.sql - so
// this route uses the session client, same reasoning as
// /api/admission/schools: the anon client physically cannot see drafts.
//
// Rate-limited + cached for the same §63 traffic-isolation reason as the
// school search endpoint - a public blog is exactly the kind of page
// that gets shared and spikes independently of any single school.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(req: Request) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const ip = getClientIp(req)

  const limit = await checkRateLimit(adminSupabase, 'public_content_read', ip, 120, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.errorResponse!.error }, { status: limit.errorResponse!.status })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')
  const page = Math.max(Number(searchParams.get('page')) || 1, 1)
  const pageSize = 12
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('content_posts')
    .select('id, title, slug, author_name, category, cover_image_url, excerpt, tags, publish_at, created_at', { count: 'exact' })
    .order('publish_at', { ascending: false, nullsFirst: false })
    .range(from, to)

  if (category) query = query.eq('category', category)
  if (tag) query = query.contains('tags', [tag])

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { posts: data ?? [], total: count ?? 0, page, pageSize },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
  )
}
