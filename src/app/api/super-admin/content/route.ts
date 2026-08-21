// src/app/api/super-admin/content/route.ts
// Phase 4, Lane H (§55 content management). All writes to content_posts
// go through here (and [id]/route.ts) using the admin client - there is
// no INSERT/UPDATE policy on that table for any session-client role, by
// design (see the migration file), so this is the only path that can
// create or edit official SchoolOS content.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const CATEGORIES = [
  'education_article', 'product_update', 'platform_announcement', 'guide',
  'success_story', 'education_news', 'tutorial', 'feature_announcement',
]

async function assertSuperAdmin() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: sa } = await adminSupabase
    .from('platform_admins')
    .select('id, full_name')
    .eq('id', user.id)
    .single()
  if (!sa) throw new Error('Not a super admin')
  return { adminId: user.id, adminName: sa.full_name as string, adminSupabase }
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

// GET - list all posts regardless of status, for the management table
export async function GET(req: Request) {
  try {
    const { adminSupabase } = await assertSuperAdmin()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = adminSupabase
      .from('content_posts')
      .select('id, title, slug, category, status, author_name, publish_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100)

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, posts: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}

// POST - create a new post (always starts as 'draft', regardless of what's sent)
export async function POST(req: Request) {
  try {
    const { adminId, adminName, adminSupabase } = await assertSuperAdmin()
    const body = await req.json().catch(() => null)
    const { title, category, cover_image_url, excerpt, body: postBody, tags, seo_title, seo_description } = body ?? {}

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return NextResponse.json({ ok: false, error: 'Title must be at least 3 characters.' }, { status: 400 })
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ ok: false, error: 'Invalid category.' }, { status: 400 })
    }
    if (!postBody || typeof postBody !== 'string' || postBody.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'Body is required.' }, { status: 400 })
    }

    let slug = slugify(title)
    // Guarantee uniqueness rather than surfacing a DB constraint error to
    // the editor mid-save - append -2, -3, ... on collision.
    let attempt = 0
    while (true) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`
      const { data: existing } = await adminSupabase.from('content_posts').select('id').eq('slug', candidate).maybeSingle()
      if (!existing) { slug = candidate; break }
      attempt++
      if (attempt > 20) return NextResponse.json({ ok: false, error: 'Could not generate a unique URL slug. Try a different title.' }, { status: 500 })
    }

    const { data, error } = await adminSupabase
      .from('content_posts')
      .insert({
        title: title.trim(),
        slug,
        author_id: adminId,
        author_name: adminName,
        category,
        cover_image_url: cover_image_url || null,
        excerpt: excerpt ? String(excerpt).slice(0, 400) : null,
        body: postBody,
        tags: Array.isArray(tags) ? tags.slice(0, 10).map((t: string) => String(t).slice(0, 40)) : [],
        seo_title: seo_title ? String(seo_title).slice(0, 70) : null,
        seo_description: seo_description ? String(seo_description).slice(0, 200) : null,
        status: 'draft',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    await adminSupabase.from('portal_audit_log').insert({
      actor_id: adminId, action: 'create_content_post', target_table: 'content_posts', target_id: data.id,
    })

    return NextResponse.json({ ok: true, post: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}
