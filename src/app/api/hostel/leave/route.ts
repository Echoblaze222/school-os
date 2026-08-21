// src/app/api/hostel/leave/route.ts
// §18: warden side of leave management. §18's flow:
// Student -> Leave Request -> Warden Review -> Approved/Rejected ->
// Parent Notification where configured -> Departure Recorded -> Return
// Recorded.
//
// GET  ?hostelId=&status=  -> requests for a hostel
// POST -> { action: 'approve'|'reject', requestId, rejectionReason? }
//        | { action: 'record_departure'|'record_return', requestId }

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
      .from('hostel_leave_requests')
      .select('*, profiles:student_id ( id, full_name )')
      .eq('hostel_id', hostelId)
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)

    const { data: requests, error } = await query
    if (error) return NextResponse.json({ error: 'Could not load leave requests.' }, { status: 500 })

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
    const auth = await requireHostelStaff(adminClient, user.id)
    if (!auth) return NextResponse.json({ error: 'You do not have hostel staff access.' }, { status: 403 })

    const body = await request.json()
    const { action, requestId, rejectionReason } = body
    if (!requestId) return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })

    const { data: leaveRequest } = await adminClient
      .from('hostel_leave_requests')
      .select('id, student_id, school_id, status, reason')
      .eq('id', requestId).maybeSingle()

    if (!leaveRequest || leaveRequest.school_id !== auth.profile.school_id) {
      return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 })
    }

    if (action === 'approve') {
      if (leaveRequest.status !== 'pending') {
        return NextResponse.json({ error: 'Only a pending request can be approved.' }, { status: 409 })
      }
      await adminClient.from('hostel_leave_requests')
        .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', requestId)
      await adminClient.from('hostel_leave_request_events')
        .insert({ request_id: requestId, event_type: 'approved', actor_id: user.id })

      const { notifiedCount } = await notifyParentsOfStudent({
        studentId: leaveRequest.student_id, schoolId: leaveRequest.school_id,
        title: 'Leave request approved',
        body: 'Your child\'s hostel leave request has been approved.',
        type: 'hostel_leave',
      })

      return NextResponse.json({ success: true, parentsNotified: notifiedCount })
    }

    if (action === 'reject') {
      if (leaveRequest.status !== 'pending') {
        return NextResponse.json({ error: 'Only a pending request can be rejected.' }, { status: 409 })
      }
      if (!rejectionReason?.trim()) {
        return NextResponse.json({ error: 'Please provide a reason for rejecting this request.' }, { status: 400 })
      }
      await adminClient.from('hostel_leave_requests')
        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejection_reason: rejectionReason.trim() })
        .eq('id', requestId)
      await adminClient.from('hostel_leave_request_events')
        .insert({ request_id: requestId, event_type: 'rejected', actor_id: user.id, note: rejectionReason.trim() })

      return NextResponse.json({ success: true })
    }

    if (action === 'record_departure') {
      if (leaveRequest.status !== 'approved') {
        return NextResponse.json({ error: 'Only an approved request can have a departure recorded.' }, { status: 409 })
      }
      await adminClient.from('hostel_leave_requests')
        .update({ departure_actual: new Date().toISOString() })
        .eq('id', requestId)
      await adminClient.from('hostel_leave_request_events')
        .insert({ request_id: requestId, event_type: 'departure_recorded', actor_id: user.id })

      await notifyParentsOfStudent({
        studentId: leaveRequest.student_id, schoolId: leaveRequest.school_id,
        title: 'Departed on approved leave',
        body: 'Your child has departed the hostel on approved leave.',
        type: 'hostel_leave',
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'record_return') {
      if (leaveRequest.status !== 'approved') {
        return NextResponse.json({ error: 'Only an approved request can have a return recorded.' }, { status: 409 })
      }
      await adminClient.from('hostel_leave_requests')
        .update({ return_actual: new Date().toISOString() })
        .eq('id', requestId)
      await adminClient.from('hostel_leave_request_events')
        .insert({ request_id: requestId, event_type: 'return_recorded', actor_id: user.id })

      await notifyParentsOfStudent({
        studentId: leaveRequest.student_id, schoolId: leaveRequest.school_id,
        title: 'Returned to hostel',
        body: 'Your child has returned to the hostel.',
        type: 'hostel_leave',
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
