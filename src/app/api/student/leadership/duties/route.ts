// src/app/api/student/leadership/duties/route.ts
// §7: assigned duties, duty completion, escalation to staff.
//
// GET  ?appointmentId=  -> duties for that appointment (must belong to caller)
// POST -> { action: 'complete' | 'escalate', dutyId, escalationNote? }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()
    const { searchParams } = new URL(request.url)
    const appointmentId = searchParams.get('appointmentId')
    if (!appointmentId) return NextResponse.json({ error: 'appointmentId is required.' }, { status: 400 })

    // Confirm this appointment actually belongs to the caller and is
    // active, before returning anything tied to it: the appointmentId
    // in the URL is client-supplied and untrusted.
    const { data: appointment } = await adminClient
      .from('appointments')
      .select('id, appointment_type, status, profile_id')
      .eq('id', appointmentId)
      .maybeSingle()

    if (!appointment || appointment.profile_id !== user.id || appointment.status !== 'active') {
      return NextResponse.json({ error: 'You do not hold this appointment.' }, { status: 403 })
    }

    const { data: duties, error } = await adminClient
      .from('leadership_duties')
      .select('id, title, description, due_date, status, created_at, completed_at, escalated_at, escalation_note')
      .eq('appointment_id', appointmentId)
      .order('status', { ascending: true }) // pending first
      .order('due_date', { ascending: true, nullsFirst: false })

    if (error) return NextResponse.json({ error: 'Could not load duties.' }, { status: 500 })

    return NextResponse.json({ appointmentType: appointment.appointment_type, duties: duties ?? [] })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()
    const body = await request.json()
    const { action, dutyId, escalationNote } = body

    if (!dutyId) return NextResponse.json({ error: 'dutyId is required.' }, { status: 400 })

    // Re-verify ownership through the duty's own appointment, server-side
    //: never trust that the caller is who the UI assumed.
    const { data: duty } = await adminClient
      .from('leadership_duties')
      .select('id, appointment_id, appointments!inner(profile_id)')
      .eq('id', dutyId)
      .maybeSingle()

    if (!duty || (duty as any).appointments?.profile_id !== user.id) {
      return NextResponse.json({ error: 'You do not have access to this duty.' }, { status: 403 })
    }

    if (action === 'complete') {
      const { error } = await adminClient
        .from('leadership_duties')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', dutyId)
      if (error) return NextResponse.json({ error: 'Could not mark this duty complete.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'escalate') {
      if (!escalationNote || !String(escalationNote).trim()) {
        return NextResponse.json({ error: 'Please explain what needs staff attention before escalating.' }, { status: 400 })
      }
      const { error } = await adminClient
        .from('leadership_duties')
        .update({ status: 'escalated', escalated_at: new Date().toISOString(), escalation_note: escalationNote })
        .eq('id', dutyId)
      if (error) return NextResponse.json({ error: 'Could not escalate this duty.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
