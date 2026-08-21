// src/app/api/ict/assets/[id]/route.ts
// PATCH: ICT-only. Field-level updates to one asset. Status/condition
// changes also write an ict_asset_events row (see events/route.ts for
// explicit maintenance/repair/borrow logging with its own description).

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
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
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabaseAuth
      .from('profiles').select('school_id').eq('id', user.id).single()
    if (!callerProfile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const allowed = await requireIctAccess(admin, user.id, callerProfile.school_id)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: asset } = await admin
      .from('ict_assets').select('id, status, condition, school_id')
      .eq('id', id).eq('school_id', callerProfile.school_id).maybeSingle()
    if (!asset) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 })

    const body = await request.json()
    const allowedFields = [
      'status', 'condition', 'location', 'assigned_to_profile', 'assigned_to_dept',
      'serial_number', 'warranty_expires_at', 'notes',
    ]
    const update: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const f of allowedFields) {
      const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      if (body[camel] !== undefined) update[f] = body[camel]
    }

    const { error: updateErr } = await admin.from('ict_assets').update(update).eq('id', id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    if (update.status && update.status !== asset.status) {
      await admin.from('ict_asset_events').insert({
        asset_id: id, school_id: callerProfile.school_id, event_type: 'status_change',
        description: `Status changed from ${asset.status} to ${update.status}`, actor_id: user.id,
      })
    }
    if (update.condition && update.condition !== asset.condition) {
      await admin.from('ict_asset_events').insert({
        asset_id: id, school_id: callerProfile.school_id, event_type: 'condition_change',
        description: `Condition changed from ${asset.condition} to ${update.condition}`, actor_id: user.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
