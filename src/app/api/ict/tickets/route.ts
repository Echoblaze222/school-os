// src/app/api/ict/tickets/route.ts
// GET: ICT's full school-wide ticket queue (ICT/principal only).
// POST: any authenticated school member reporting an issue, RLS lets
// them insert their own row directly from the client too, but this
// route also exists so it can fire the "new support ticket" ICT
// notification (§27) in the same request rather than relying on a DB
// trigger the rest of this codebase doesn't otherwise use.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'
import { notifyAppointmentHolders } from '@/lib/notify'

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
  const { data: profile } = await supabaseAuth
    .from('profiles').select('id, school_id, full_name, role').eq('id', user.id).single()
  if (!profile) return null
  return { user, profile }
}

export async function GET(request: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const allowed = await requireIctAccess(admin, caller.user.id, caller.profile.school_id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const priority = url.searchParams.get('priority')

  let query = admin
    .from('ict_tickets')
    .select('id, reporter_id, location, category, description, priority, status, assigned_to, created_at, updated_at, profiles!ict_tickets_reporter_id_fkey(full_name)')
    .eq('school_id', caller.profile.school_id)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data })
}

export async function POST(request: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { location, deviceId, category, description, priority, attachments } = await request.json()
  if (!category || !description) {
    return NextResponse.json({ error: 'category and description are required.' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: ticket, error } = await admin
    .from('ict_tickets')
    .insert({
      school_id:    caller.profile.school_id,
      reporter_id:  caller.user.id,
      location:     location ?? null,
      device_id:    deviceId ?? null,
      category,
      description,
      priority:     priority ?? 'normal',
      attachments:  attachments ?? [],
      status:       'new',
    })
    .select('id, priority')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('ict_ticket_events').insert({
    ticket_id: ticket.id, from_status: null, to_status: 'new', actor_id: caller.user.id,
  })

  // §27: "new support ticket" always; "high-priority incident" is a
  // second, more urgent alert layered on top for urgent/high tickets:
  // not a replacement for the first, since the ICT team should still see
  // routine tickets land even when an urgent one is also firing.
  const ICT_APPOINTMENTS = ['ict_officer', 'ict_administrator']
  await notifyAppointmentHolders(admin, caller.profile.school_id, ICT_APPOINTMENTS, {
    title: 'New ICT support ticket',
    body:  `${caller.profile.full_name} reported: ${category.replace('_', ' ')}`,
    type:  'ict_ticket',
    action_url: `/dashboard/ict/tickets`,
  }).catch(() => {})

  if (['high', 'urgent'].includes(priority)) {
    await notifyAppointmentHolders(admin, caller.profile.school_id, ICT_APPOINTMENTS, {
      title: `High-priority ICT issue: ${category.replace('_', ' ')}`,
      body:  description.slice(0, 140),
      type:  'ict_incident',
      action_url: `/dashboard/ict/tickets`,
    }, { alsoNotifyPrincipal: true }).catch(() => {})
  }

  return NextResponse.json({ success: true, ticketId: ticket.id })
}
