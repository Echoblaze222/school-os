// src/app/api/hostel/incidents/route.ts
// §19: incident management, restricted visibility by design: no
// student or prefect access path exists anywhere in this file, matching
// the RLS policy that also excludes them.
//
// GET  ?hostelId=&status=  -> incidents for a hostel (staff/admin only)
// POST -> { action: 'report', hostelId, studentId?, location?, incidentType,
//           description, peopleInvolved?, witnesses? }
//        | { action: 'resolve', incidentId, resolution }
//        | { action: 'escalate', incidentId, note }
//        | { action: 'notify_parent', incidentId }  -- explicit opt-in,
//           sends a fixed safe template, never the raw description

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireHostelStaff } from '@/lib/permissions'
import { notifyParentsOfStudent } from '@/lib/notify/notifyParents'

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()
    const auth = await requireHostelStaff(adminClient, user.id)
    if (!auth) return NextResponse.json({ error: 'You do not have hostel staff access.' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const hostelId = searchParams.get('hostelId')
    const status = searchParams.get('status')
    if (!hostelId) return NextResponse.json({ error: 'hostelId is required.' }, { status: 400 })

    let query = adminClient
      .from('hostel_incidents')
      .select('*, profiles:student_id ( id, full_name )')
      .eq('hostel_id', hostelId)
      .order('occurred_at', { ascending: false })
    if (status) query = query.eq('status', status)

    const { data: incidents, error } = await query
    if (error) return NextResponse.json({ error: 'Could not load incidents.' }, { status: 500 })

    return NextResponse.json({ incidents: incidents ?? [] })

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
    const auth = await requireHostelStaff(adminClient, user.id)
    if (!auth) return NextResponse.json({ error: 'You do not have hostel staff access.' }, { status: 403 })

    const body = await request.json()
    const { action } = body

    if (action === 'report') {
      const { hostelId, studentId, location, incidentType, description, peopleInvolved, witnesses } = body
      if (!hostelId || !incidentType || !description?.trim()) {
        return NextResponse.json({ error: 'Incident type and description are required.' }, { status: 400 })
      }

      const { data: hostel } = await adminClient.from('hostels').select('school_id').eq('id', hostelId).maybeSingle()
      if (!hostel || hostel.school_id !== auth.profile.school_id) {
        return NextResponse.json({ error: 'Hostel not found.' }, { status: 404 })
      }

      const { data: incident, error } = await adminClient
        .from('hostel_incidents')
        .insert({
          school_id: auth.profile.school_id, hostel_id: hostelId, student_id: studentId ?? null,
          location: location ?? null, incident_type: incidentType, description: description.trim(),
          people_involved: peopleInvolved ?? [], witnesses: witnesses ?? [], reported_by: user.id,
        })
        .select('id').single()

      if (error || !incident) return NextResponse.json({ error: 'Could not save this incident.' }, { status: 500 })

      await adminClient.from('hostel_incident_events')
        .insert({ incident_id: incident.id, event_type: 'reported', actor_id: user.id })

      return NextResponse.json({ success: true, incidentId: incident.id })
    }

    const { incidentId } = body
    if (!incidentId) return NextResponse.json({ error: 'incidentId is required.' }, { status: 400 })

    const { data: incident } = await adminClient
      .from('hostel_incidents').select('id, school_id, student_id').eq('id', incidentId).maybeSingle()
    if (!incident || incident.school_id !== auth.profile.school_id) {
      return NextResponse.json({ error: 'Incident not found.' }, { status: 404 })
    }

    if (action === 'resolve') {
      const { resolution } = body
      if (!resolution?.trim()) return NextResponse.json({ error: 'A resolution note is required.' }, { status: 400 })
      await adminClient.from('hostel_incidents')
        .update({ status: 'resolved', resolution: resolution.trim(), resolved_at: new Date().toISOString(), resolved_by: user.id })
        .eq('id', incidentId)
      await adminClient.from('hostel_incident_events')
        .insert({ incident_id: incidentId, event_type: 'resolved', actor_id: user.id, note: resolution.trim() })
      return NextResponse.json({ success: true })
    }

    if (action === 'escalate') {
      const { note } = body
      if (!note?.trim()) return NextResponse.json({ error: 'Please explain what needs escalation.' }, { status: 400 })
      await adminClient.from('hostel_incidents').update({ status: 'escalated' }).eq('id', incidentId)
      await adminClient.from('hostel_incident_events')
        .insert({ incident_id: incidentId, event_type: 'escalated', actor_id: user.id, note: note.trim() })
      return NextResponse.json({ success: true })
    }

    if (action === 'notify_parent') {
      if (!incident.student_id) {
        return NextResponse.json({ error: 'This incident has no student on record to notify a parent about.' }, { status: 400 })
      }
      // Fixed, safe template: never the raw incident description. See
      // file header for why this function has no parameter for it.
      const { notifiedCount } = await notifyParentsOfStudent({
        studentId: incident.student_id, schoolId: incident.school_id,
        title: 'Hostel incident notice',
        body: 'The hostel team has recorded an incident involving your child and wanted to keep you informed. Please contact the school for details.',
        type: 'hostel_incident',
      })
      await adminClient.from('hostel_incidents')
        .update({ parent_notified_at: new Date().toISOString(), parent_notified_by: user.id })
        .eq('id', incidentId)
      return NextResponse.json({ success: true, parentsNotified: notifiedCount })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
