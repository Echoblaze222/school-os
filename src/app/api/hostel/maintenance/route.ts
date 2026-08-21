// src/app/api/hostel/maintenance/route.ts
// §20: hostel maintenance requests. `assigned_to_profile_id` is a plain
// nullable link, not a hard dependency on Lane D's ICT ticket schema :
// see the README for why, and `ict_ticket_id` on the table if that
// integration gets wired up later.
//
// GET  ?hostelId=&status=
// POST -> { action: 'report', hostelId, roomId?, issueType, description }
//        | { action: 'assign', requestId, assignedToProfileId }
//        | { action: 'resolve', requestId, resolutionNote }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireHostelStaff } from '@/lib/permissions'

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
      .from('hostel_maintenance_requests')
      .select('*, hostel_rooms ( name )')
      .eq('hostel_id', hostelId)
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)

    const { data: requests, error } = await query
    if (error) return NextResponse.json({ error: 'Could not load maintenance requests.' }, { status: 500 })

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
    const { action } = body

    if (action === 'report') {
      const { hostelId, roomId, issueType, description } = body
      if (!hostelId || !issueType || !description?.trim()) {
        return NextResponse.json({ error: 'Issue type and description are required.' }, { status: 400 })
      }
      const { error } = await adminClient
        .from('hostel_maintenance_requests')
        .insert({
          school_id: auth.profile.school_id, hostel_id: hostelId, room_id: roomId ?? null,
          issue_type: issueType, description: description.trim(), reported_by: user.id,
        })
      if (error) return NextResponse.json({ error: 'Could not save this maintenance request.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    const { requestId } = body
    if (!requestId) return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })

    if (action === 'assign') {
      const { assignedToProfileId } = body
      if (!assignedToProfileId) return NextResponse.json({ error: 'assignedToProfileId is required.' }, { status: 400 })
      const { error } = await adminClient
        .from('hostel_maintenance_requests')
        .update({ status: 'in_progress', assigned_to_profile_id: assignedToProfileId })
        .eq('id', requestId)
      if (error) return NextResponse.json({ error: 'Could not assign this request.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'resolve') {
      const { resolutionNote } = body
      const { error } = await adminClient
        .from('hostel_maintenance_requests')
        .update({ status: 'resolved', resolution_note: resolutionNote ?? null, resolved_at: new Date().toISOString() })
        .eq('id', requestId)
      if (error) return NextResponse.json({ error: 'Could not resolve this request.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
