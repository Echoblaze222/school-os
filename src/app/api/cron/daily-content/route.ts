// src/app/api/cron/daily-content/route.ts
// Vercel Cron Job - configured in vercel.json:
// { "path": "/api/cron/daily-content", "schedule": "0 5 * * *" }
// (5am UTC = 6am WAT)
//
// Generates and verifies one content_posts draft per run (see
// lib/ai/dailyContent.ts for scope/rules), attaches a licensed stock photo
// if UNSPLASH_ACCESS_KEY is set, and inserts it with status = 'review'.
// It never publishes anything itself - the existing /super-admin/content
// page already filters by 'review' status, so nothing new was needed
// there to approve or edit what this generates.
//
// If nothing genuinely current/verifiable was found, or generation fails
// outright, this is a deliberate no-op - it does not force a post every
// single day. Protected by CRON_SECRET, same pattern as every other
// /api/cron/* route in this codebase.
//
// Manual test run (creates a real review-status row if content is found):
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<your-domain>/api/cron/daily-content"

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateDailyContent } from '@/lib/ai/dailyContent'
import { findStockPhoto } from '@/lib/images/unsplash'
import { logger, newTraceId } from '@/lib/logger'

function slugify(title: string) {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/^-+|-+$/g, '')
  return slug || 'post'
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const traceId = newTraceId()
  const adminSupabase = createAdminClient()

  try {
    const draft = await generateDailyContent()
    if (!draft) {
      logger.info('cron/daily-content: no verified content found, skipping', { traceId })
      return NextResponse.json({ ok: true, created: false, reason: 'No verified content found.' })
    }

    const photo = await findStockPhoto(draft.image_query)
    const body = photo ? `${draft.body}\n\n---\n*${photo.attribution}. Source: ${draft.source_url}*`
      : `${draft.body}\n\n---\n*Source: ${draft.source_url}*`

    let slug = slugify(draft.title)
    let attempt = 0
    while (true) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`
      const { data: existing } = await adminSupabase.from('content_posts').select('id').eq('slug', candidate).maybeSingle()
      if (!existing) { slug = candidate; break }
      attempt++
      if (attempt > 20) { slug = `${slug}-${Date.now()}`; break }
    }

    const { data: inserted, error } = await adminSupabase.from('content_posts').insert({
      title: draft.title,
      slug,
      author_id: null,
      author_name: 'SchoolOS AI',
      category: draft.category,
      cover_image_url: photo?.url ?? null,
      excerpt: draft.excerpt,
      body,
      tags: ['ai-generated'],
      status: 'review',
    }).select('id').single()

    if (error) {
      logger.error('cron/daily-content: insert failed', { traceId, error: error.message })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    await adminSupabase.from('portal_audit_log').insert({
      actor_id: null,
      action: 'content_post.ai_generated',
      target_table: 'content_posts',
      target_id: inserted.id,
      metadata: { source: 'daily_content_bot', source_url: draft.source_url, trace_id: traceId },
    })

    logger.info('cron/daily-content run complete', { traceId, postId: inserted.id, title: draft.title })
    return NextResponse.json({ ok: true, created: true, postId: inserted.id, title: draft.title })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('cron/daily-content: unhandled error', { traceId, error: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
