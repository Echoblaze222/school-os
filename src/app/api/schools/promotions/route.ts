// src/app/api/schools/promotions/route.ts
// Lane E - a school's own promotions list (all statuses) and creation.
// Only principal/secretary/admin of the promotion's own school may call this.
// RLS on school_promotions backs this up independently (see
// sql/lane-e-f-promotions-rankings.sql), so even a bug here can't leak
// another school's drafts - but we still check explicitly for a clean
// 401/403 instead of relying on RLS to silently return nothing.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSafeHttpUrl } from '@/lib/validation/safeUrl'

const ALLOWED_ROLES = ['principal', 'secretary', 'admin']

const PROMOTION_TYPES = [
  'admission', 'open_day', 'scholarship', 'event', 'academic_program',
  'achievement', 'announcement', 'campaign', 'article', 'facility',
  'boarding', 'application_deadline',
] as const

async function requireStaff() {
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

  return { supabase, profile } as const
}

export async function GET() {
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { supabase, profile } = auth

  const { data, error } = await supabase
    .from('school_promotions')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[promotions] list failed:', error.message)
    return NextResponse.json({ error: 'Failed to load promotions' }, { status: 500 })
  }

  return NextResponse.json({ promotions: data ?? [] })
}

interface CreateBody {
  promotion_type?: string
  title?: string
  summary?: string
  body?: string | null
  image_url?: string | null
  external_link?: string | null
  placement?: string
  start_date?: string
  end_date?: string
  is_sponsored?: boolean
}

export async function POST(req: Request) {
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { supabase, profile } = auth

  let payload: CreateBody
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { promotion_type, title, summary, body, image_url, external_link,
    placement, start_date, end_date, is_sponsored } = payload

  if (!promotion_type || !PROMOTION_TYPES.includes(promotion_type as any)) {
    return NextResponse.json({ error: 'A valid promotion type is required.' }, { status: 400 })
  }
  if (!title || title.trim().length < 3) {
    return NextResponse.json({ error: 'Title needs at least 3 characters.' }, { status: 400 })
  }
  if (!summary || summary.trim().length < 3) {
    return NextResponse.json({ error: 'Summary needs at least 3 characters.' }, { status: 400 })
  }
  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'Start and end dates are required.' }, { status: 400 })
  }
  if (new Date(end_date) < new Date(start_date)) {
    return NextResponse.json({ error: 'End date can\'t be before the start date.' }, { status: 400 })
  }
  if (external_link && !isSafeHttpUrl(external_link)) {
    return NextResponse.json({ error: 'The link must be a valid http:// or https:// address.' }, { status: 400 })
  }
  if (image_url && !isSafeHttpUrl(image_url)) {
    return NextResponse.json({ error: 'The image URL must be a valid http:// or https:// address.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('school_promotions')
    .insert({
      school_id: profile.school_id,
      created_by: profile.id,
      promotion_type,
      title: title.trim(),
      summary: summary.trim(),
      body: body?.trim() || null,
      image_url: image_url || null,
      external_link: external_link || null,
      placement: placement || 'discovery_feed',
      start_date,
      end_date,
      is_sponsored: !!is_sponsored,
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    console.error('[promotions] create failed:', error.message)
    return NextResponse.json({ error: 'Couldn\'t save this promotion. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ promotion: data }, { status: 201 })
}
