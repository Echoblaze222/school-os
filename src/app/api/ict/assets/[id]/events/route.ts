// src/app/api/ict/assets/[id]/events/route.ts
// POST: log a maintenance/repair/issue/borrow/return/note event against
// an asset (§10, "maintenance history, repair history, issue history,
// equipment borrowing/return"). GET: full event history for the asset.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'

const EVENT_TYPES = ['maintenance', 'repair', 'issue_reported', 'borrowed', 'returned', 'note']

async function getCaller() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile) return null
  return { user, profile }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data, error } = await admin
    .from('ict_asset_events')
    .select('*')
    .eq('asset_id', id)
    .eq('school_id', caller.profile.school_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const allowed = await requireIctAccess(admin, caller.user.id, caller.profile.school_id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { eventType, description, borrowedBy, dueBackAt } = await request.json()
  if (!eventType || !EVENT_TYPES.includes(eventType) || !description) {
    return NextResponse.json({ error: 'Valid eventType and description are required.' }, { status: 400 })
  }

  const { data: asset } = await admin
    .from('ict_assets').select('id').eq('id', id).eq('school_id', caller.profile.school_id).maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 })

  const { error } = await admin.from('ict_asset_events').insert({
    asset_id: id, school_id: caller.profile.school_id, event_type: eventType, description,
    borrowed_by: eventType === 'borrowed' ? borrowedBy ?? null : null,
    due_back_at: eventType === 'borrowed' ? dueBackAt ?? null : null,
    actor_id: caller.user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Borrowing sets the asset to in_storage->in_use tracking is left to a
  // manual status update by ICT (deliberate, a borrowed projector is
  // still "in_use", just relocated; forcing a status flip here would be
  // an assumption this route shouldn't make silently).
  return NextResponse.json({ success: true })
}
