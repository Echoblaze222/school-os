// src/app/api/schools/promotions/[id]/route.ts
// Lane E - update, submit-for-review, pause, or delete a single promotion.
// Ownership is re-checked on every write (school_id match), on top of RLS.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSafeHttpUrl } from '@/lib/validation/safeUrl'

const ALLOWED_ROLES = ['principal', 'secretary', 'admin']
const EDITABLE_STATUSES = ['draft', 'rejected'] // once submitted, content is locked until rejected/expired

async function requireOwner(id: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || !ALLOWED_ROLES.includes(profile.role) || !profile.school_id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const
  }

  const { data: promotion } = await supabase
    .from('school_promotions')
    .select('*')
    .eq('id', id)
    .single()

  if (!promotion || promotion.school_id !== profile.school_id) {
    // Same response whether it doesn't exist or belongs to another school - // don't let the error message confirm another school's promotion IDs.
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) } as const
  }

  return { supabase, profile, promotion } as const
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOwner(id)
  if ('error' in auth) return auth.error
  const { supabase, promotion } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Special action: submit for review / take live.
  if (body.action === 'submit') {
    if (!EDITABLE_STATUSES.includes(promotion.status)) {
      return NextResponse.json({ error: `Can't submit a promotion that's already ${promotion.status}.` }, { status: 409 })
    }
    const nextStatus = promotion.requires_moderation ? 'pending_review' : 'live'
    const { data, error } = await supabase
      .from('school_promotions')
      .update({ status: nextStatus, rejection_reason: null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Couldn\'t submit this promotion.' }, { status: 500 })
    return NextResponse.json({ promotion: data })
  }

  if (body.action === 'pause') {
    if (promotion.status !== 'live') {
      return NextResponse.json({ error: 'Only a live promotion can be paused.' }, { status: 409 })
    }
    const { data, error } = await supabase
      .from('school_promotions')
      .update({ status: 'paused' })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Couldn\'t pause this promotion.' }, { status: 500 })
    return NextResponse.json({ promotion: data })
  }

  if (body.action === 'resume') {
    if (promotion.status !== 'paused') {
      return NextResponse.json({ error: 'Only a paused promotion can be resumed.' }, { status: 409 })
    }
    const nextStatus = promotion.requires_moderation ? 'pending_review' : 'live'
    const { data, error } = await supabase
      .from('school_promotions')
      .update({ status: nextStatus })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Couldn\'t resume this promotion.' }, { status: 500 })
    return NextResponse.json({ promotion: data })
  }

  // Otherwise, a content edit. Only allowed while draft/rejected - a live
  // or pending promotion can't be silently rewritten after approval.
  if (!EDITABLE_STATUSES.includes(promotion.status)) {
    return NextResponse.json(
      { error: `This promotion is ${promotion.status} and can't be edited. Pause it first.` },
      { status: 409 }
    )
  }

  const editable = ['promotion_type', 'title', 'summary', 'body', 'image_url',
    'external_link', 'placement', 'start_date', 'end_date', 'is_sponsored']
  const updates: Record<string, unknown> = {}
  for (const key of editable) {
    if (key in body) updates[key] = body[key]
  }

  if ('external_link' in updates && updates.external_link && !isSafeHttpUrl(String(updates.external_link))) {
    return NextResponse.json({ error: 'The link must be a valid http:// or https:// address.' }, { status: 400 })
  }
  if ('image_url' in updates && updates.image_url && !isSafeHttpUrl(String(updates.image_url))) {
    return NextResponse.json({ error: 'The image URL must be a valid http:// or https:// address.' }, { status: 400 })
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('school_promotions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[promotions] update failed:', error.message)
    return NextResponse.json({ error: 'Couldn\'t save your changes.' }, { status: 500 })
  }

  return NextResponse.json({ promotion: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOwner(id)
  if ('error' in auth) return auth.error
  const { supabase, promotion } = auth

  if (promotion.status === 'live') {
    return NextResponse.json(
      { error: 'Pause a live promotion before deleting it.' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('school_promotions').delete().eq('id', id)
  if (error) {
    console.error('[promotions] delete failed:', error.message)
    return NextResponse.json({ error: 'Couldn\'t delete this promotion.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
