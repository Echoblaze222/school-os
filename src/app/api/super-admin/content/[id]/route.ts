// src/app/api/super-admin/content/[id]/route.ts
// Phase 4, Lane H (§55). See route.ts (list/create) for the shared
// assertSuperAdmin() pattern and why writes only ever go through the
// admin client.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const CATEGORIES = [
  'education_article', 'product_update', 'platform_announcement', 'guide',
  'success_story', 'education_news', 'tutorial', 'feature_announcement',
]
const STATUSES = ['draft', 'review', 'scheduled', 'published', 'archived']

async function assertSuperAdmin() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: sa } = await adminSupabase.from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) throw new Error('Not a super admin')
  return { adminId: user.id, adminSupabase }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { adminSupabase } = await assertSuperAdmin()
    const { id } = await params
    const { data, error } = await adminSupabase.from('content_posts').select('*').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ ok: true, post: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { adminId, adminSupabase } = await assertSuperAdmin()
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })

    const update: Record<string, unknown> = {}

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length < 3) {
        return NextResponse.json({ ok: false, error: 'Title must be at least 3 characters.' }, { status: 400 })
      }
      update.title = body.title.trim()
    }
    if (body.category !== undefined) {
      if (!CATEGORIES.includes(body.category)) return NextResponse.json({ ok: false, error: 'Invalid category.' }, { status: 400 })
      update.category = body.category
    }
    if (body.cover_image_url !== undefined) update.cover_image_url = body.cover_image_url || null
    if (body.excerpt !== undefined) update.excerpt = body.excerpt ? String(body.excerpt).slice(0, 400) : null
    if (body.body !== undefined) {
      if (!body.body || String(body.body).trim().length === 0) {
        return NextResponse.json({ ok: false, error: 'Body cannot be empty.' }, { status: 400 })
      }
      update.body = body.body
    }
    if (body.tags !== undefined) {
      update.tags = Array.isArray(body.tags) ? body.tags.slice(0, 10).map((t: string) => String(t).slice(0, 40)) : []
    }
    if (body.seo_title !== undefined) update.seo_title = body.seo_title ? String(body.seo_title).slice(0, 70) : null
    if (body.seo_description !== undefined) update.seo_description = body.seo_description ? String(body.seo_description).slice(0, 200) : null
    if (body.publish_at !== undefined) update.publish_at = body.publish_at || null

    // Status transitions (§55: Draft -> Review -> Scheduled -> Published -> Archived).
    // Not enforced as a strict linear state machine - an editor can send a
    // published post back to draft to fix a typo, for instance - but
    // 'scheduled'/'published' without a publish_at is rejected here as a
    // clearer error than letting the DB constraint reject it.
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return NextResponse.json({ ok: false, error: 'Invalid status.' }, { status: 400 })
      const nextPublishAt = body.publish_at !== undefined ? body.publish_at : undefined
      if ((body.status === 'scheduled' || body.status === 'published')) {
        const { data: existing } = await adminSupabase.from('content_posts').select('publish_at').eq('id', id).maybeSingle()
        const effectivePublishAt = nextPublishAt ?? existing?.publish_at
        if (!effectivePublishAt) {
          return NextResponse.json({ ok: false, error: 'Set a publish date before scheduling or publishing.' }, { status: 400 })
        }
        // Publishing immediately (no future date chosen) - default to now.
        if (body.status === 'published' && nextPublishAt === undefined && !existing?.publish_at) {
          update.publish_at = new Date().toISOString()
        }
      }
      update.status = body.status
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 })
    }

    const { data, error } = await adminSupabase.from('content_posts').update(update).eq('id', id).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    await adminSupabase.from('portal_audit_log').insert({
      actor_id: adminId, action: 'update_content_post', target_table: 'content_posts', target_id: id,
      metadata: { fields: Object.keys(update) },
    })

    return NextResponse.json({ ok: true, post: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}

// DELETE - archives rather than hard-deletes by default (safer default for
// content that may already be indexed/shared); pass ?hard=true to actually
// remove the row.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { adminId, adminSupabase } = await assertSuperAdmin()
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const hard = searchParams.get('hard') === 'true'

    if (hard) {
      const { error } = await adminSupabase.from('content_posts').delete().eq('id', id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      await adminSupabase.from('portal_audit_log').insert({
        actor_id: adminId, action: 'delete_content_post', target_table: 'content_posts', target_id: id,
      })
      return NextResponse.json({ ok: true, deleted: true })
    }

    const { error } = await adminSupabase.from('content_posts').update({ status: 'archived' }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await adminSupabase.from('portal_audit_log').insert({
      actor_id: adminId, action: 'archive_content_post', target_table: 'content_posts', target_id: id,
    })
    return NextResponse.json({ ok: true, archived: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}
