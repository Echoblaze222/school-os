// src/app/api/ict/tickets/[id]/route.ts
// PATCH: ICT-only. Moves a ticket through New -> Assigned -> In Progress
// -> Waiting -> Resolved -> Closed (§11), always writing an
// ict_ticket_events row so "status history" is real, not just the
// current column value.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'

const VALID_STATUSES = ['new', 'assigned', 'in_progress', 'waiting', 'resolved', 'closed']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { status, assignedTo, resolution, note } = await request.json()

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }

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

    const { data: ticket } = await admin
      .from('ict_tickets')
      .select('id, status, school_id')
      .eq('id', id)
      .eq('school_id', callerProfile.school_id)
      .maybeSingle()
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })

    const update: Record<string, any> = { updated_at: new Date().toISOString() }
    if (status) update.status = status
    if (assignedTo !== undefined) update.assigned_to = assignedTo
    if (resolution !== undefined) update.resolution = resolution
    if (status === 'resolved') update.resolved_at = new Date().toISOString()

    const { error: updateErr } = await admin.from('ict_tickets').update(update).eq('id', id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    if (status && status !== ticket.status) {
      await admin.from('ict_ticket_events').insert({
        ticket_id: id, from_status: ticket.status, to_status: status, note: note ?? null, actor_id: user.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
