// src/app/api/hostel/dashboard-summary/route.ts
// Powers §13's Hostel Dashboard overview: boarding student count,
// accounted-for count, beds available/occupied, vacant rooms,
// absent/on-leave/late-return counts, open incidents, open maintenance
// requests.
//
// Incident and maintenance counts now read from Lane E2's real tables
// (hostel_incidents, hostel_maintenance_requests). `e2Pending` stays in
// the payload, now always false, so the client component doesn't need a
// separate deploy to drop the field.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireHostelStaff } from '@/lib/permissions'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()

    const auth = await requireHostelStaff(adminClient, user.id)
    if (!auth) {
      return NextResponse.json({ error: 'You do not have hostel staff access.' }, { status: 403 })
    }
    const schoolId = auth.profile.school_id

    const { searchParams } = new URL(request.url)
    const hostelId = searchParams.get('hostelId') // optional filter to one hostel

    let hostelIdsQuery = adminClient.from('hostels').select('id').eq('school_id', schoolId)
    if (hostelId) hostelIdsQuery = hostelIdsQuery.eq('id', hostelId)
    const { data: hostelRows, error: hostelErr } = await hostelIdsQuery
    if (hostelErr) {
      return NextResponse.json({ error: 'Could not load hostels for your school.' }, { status: 500 })
    }
    const hostelIds = (hostelRows ?? []).map(h => h.id)
    if (hostelIds.length === 0) {
      return NextResponse.json({
        boardingStudentCount: 0, accountedFor: 0, bedsAvailable: 0, bedsOccupied: 0,
        vacantRooms: 0, absent: 0, onLeave: 0, lateReturns: 0,
        openIncidents: 0, openMaintenance: 0, e2Pending: false,
      })
    }

    // Beds: available vs occupied, and rooms with zero occupied beds (vacant)
    const { data: beds } = await adminClient
      .from('hostel_beds')
      .select('id, status, room_id, hostel_rooms!inner(block_id, hostel_blocks!inner(hostel_id))')
      .in('hostel_rooms.hostel_blocks.hostel_id', hostelIds)

    const bedsOccupied = (beds ?? []).filter(b => b.status === 'occupied').length
    const bedsAvailable = (beds ?? []).filter(b => b.status === 'available').length

    const { data: rooms } = await adminClient
      .from('hostel_rooms')
      .select('id, hostel_blocks!inner(hostel_id)')
      .in('hostel_blocks.hostel_id', hostelIds)
    const roomIds = (rooms ?? []).map(r => r.id)
    const occupiedRoomIds = new Set(
      (beds ?? []).filter(b => b.status === 'occupied').map(b => b.room_id)
    )
    const vacantRooms = roomIds.filter(id => !occupiedRoomIds.has(id)).length

    // Boarding student count = active bed assignments across these hostels
    const { count: boardingStudentCount } = await adminClient
      .from('hostel_bed_assignments')
      .select('id, hostel_beds!inner(room_id, hostel_rooms!inner(block_id, hostel_blocks!inner(hostel_id)))', { count: 'exact', head: true })
      .eq('status', 'active')
      .in('hostel_beds.hostel_rooms.hostel_blocks.hostel_id', hostelIds)

    // Most recent open (or today's) roll-call session per hostel, for
    // "accounted for / absent / on leave / late": reads the most recent
    // session per hostel rather than assuming one is currently open.
    const { data: sessions } = await adminClient
      .from('hostel_roll_call_sessions')
      .select('id, hostel_id, session_date, session_type')
      .in('hostel_id', hostelIds)
      .order('session_date', { ascending: false })
      .order('opened_at', { ascending: false })

    // Take the latest session per hostel
    const latestSessionByHostel = new Map<string, string>()
    for (const s of sessions ?? []) {
      if (!latestSessionByHostel.has(s.hostel_id)) latestSessionByHostel.set(s.hostel_id, s.id)
    }
    const latestSessionIds = Array.from(latestSessionByHostel.values())

    let accountedFor = 0, absent = 0, onLeave = 0, lateReturns = 0
    if (latestSessionIds.length > 0) {
      const { data: entries } = await adminClient
        .from('hostel_roll_call_entries')
        .select('status')
        .in('session_id', latestSessionIds)
      for (const e of entries ?? []) {
        if (e.status === 'present') accountedFor++
        else if (e.status === 'absent') absent++
        else if (e.status === 'on_leave') onLeave++
        else if (e.status === 'late') lateReturns++
      }
    }

    // Open incidents and maintenance requests: Lane E2 tables.
    const { count: openIncidents } = await adminClient
      .from('hostel_incidents')
      .select('id', { count: 'exact', head: true })
      .in('hostel_id', hostelIds)
      .in('status', ['open', 'escalated'])

    const { count: openMaintenance } = await adminClient
      .from('hostel_maintenance_requests')
      .select('id', { count: 'exact', head: true })
      .in('hostel_id', hostelIds)
      .in('status', ['open', 'in_progress'])

    return NextResponse.json({
      boardingStudentCount: boardingStudentCount ?? 0,
      accountedFor,
      bedsAvailable,
      bedsOccupied,
      vacantRooms,
      absent,
      onLeave,
      lateReturns,
      openIncidents: openIncidents ?? 0,
      openMaintenance: openMaintenance ?? 0,
      e2Pending: false,
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    console.error('[hostel/dashboard-summary]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
