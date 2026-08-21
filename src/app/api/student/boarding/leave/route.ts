// src/app/api/student/boarding/leave/route.ts
// §18: student side of leave management.
// GET  -> the caller's own leave requests
// POST -> { action: 'submit', hostelId, reason, isEmergency, destination,
//           departureExpected, returnExpected }
//        | { action: 'cancel', requestId }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()
    const { data: requests, error } = await adminClient
      .from('hostel_leave_requests')
      .select('*')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: 'Could not load your leave requests.' }, { status: 500 })
    return NextResponse.json({ requests: requests ?? [] })

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
    const { action } = body

    if (action === 'submit') {
      const { hostelId, reason, isEmergency, destination, departureExpected, returnExpected } = body

      if (!hostelId || !reason?.trim() || !departureExpected || !returnExpected) {
        return NextResponse.json(
          { error: 'Reason, expected departure, and expected return are all required.' },
          { status: 400 }
        )
      }
      if (new Date(returnExpected) <= new Date(departureExpected)) {
        return NextResponse.json(
          { error: 'Expected return must be after expected departure.' },
          { status: 400 }
        )
      }

      // Confirm the caller actually boards at this hostel before letting
      // them file a leave request against it.
      const { data: assignment } = await adminClient
        .from('hostel_bed_assignments')
        .select('id, hostel_beds!inner(room_id, hostel_rooms!inner(block_id, hostel_blocks!inner(hostel_id)))')
        .eq('student_id', user.id).eq('status', 'active').maybeSingle()

      const assignedHostelId = (assignment as any)?.hostel_beds?.hostel_rooms?.hostel_blocks?.hostel_id
      if (!assignment || assignedHostelId !== hostelId) {
        return NextResponse.json({ error: 'You are not currently assigned to this hostel.' }, { status: 403 })
      }

      const { data: hostel } = await adminClient.from('hostels').select('school_id').eq('id', hostelId).single()

      const { data: newRequest, error } = await adminClient
        .from('hostel_leave_requests')
        .insert({
          school_id: hostel!.school_id, hostel_id: hostelId, student_id: user.id,
          reason: reason.trim(), is_emergency: !!isEmergency, destination: destination ?? null,
          departure_expected: departureExpected, return_expected: returnExpected,
        })
        .select('id').single()

      if (error || !newRequest) {
        return NextResponse.json({ error: 'Could not submit your leave request.' }, { status: 500 })
      }

      await adminClient.from('hostel_leave_request_events').insert({
        request_id: newRequest.id, event_type: 'submitted', actor_id: user.id,
      })

      return NextResponse.json({ success: true, requestId: newRequest.id })
    }

    if (action === 'cancel') {
      const { requestId } = body
      if (!requestId) return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })

      const { data: existing } = await adminClient
        .from('hostel_leave_requests').select('id, student_id, status').eq('id', requestId).maybeSingle()

      if (!existing || existing.student_id !== user.id) {
        return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 })
      }
      if (existing.status !== 'pending') {
        return NextResponse.json({ error: 'Only a pending request can be cancelled.' }, { status: 409 })
      }

      await adminClient.from('hostel_leave_requests')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id })
        .eq('id', requestId)
      await adminClient.from('hostel_leave_request_events')
        .insert({ request_id: requestId, event_type: 'cancelled', actor_id: user.id })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
