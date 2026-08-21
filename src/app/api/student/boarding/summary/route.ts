// src/app/api/student/boarding/summary/route.ts
// §15: my hostel/block/room/bed, roll-call status, and hostel
// announcements. Reuses Lane E1's tables directly (hostel_bed_assignments,
// hostel_roll_call_entries) rather than duplicating student-facing copies
// of the same data.
//
// Leave request status now comes from Lane E2's
// /api/student/boarding/leave route, called separately by the client :
// kept as its own endpoint rather than folded in here since leave
// requests have their own submit/cancel actions the summary route has
// no reason to handle.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()

    const { data: assignment } = await adminClient
      .from('hostel_bed_assignments')
      .select(`
        id, assigned_at,
        hostel_beds!inner (
          id, label,
          hostel_rooms!inner (
            id, name,
            hostel_blocks!inner (
              id, name,
              hostels!inner ( id, name )
            )
          )
        )
      `)
      .eq('student_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!assignment) {
      return NextResponse.json({ boarding: false })
    }

    const bed = (assignment as any).hostel_beds
    const room = bed.hostel_rooms
    const block = room.hostel_blocks
    const hostel = block.hostels

    // Roommates: other students with an active assignment in the same
    // room. §15 says "authorized roommate information": first name +
    // last initial only, not full contact details, since roommates
    // aren't staff and don't need each other's full profile.
    const { data: roommateRows } = await adminClient
      .from('hostel_bed_assignments')
      .select('student_id, profiles:student_id ( full_name )')
      .eq('status', 'active')
      .neq('student_id', user.id)
      .in('bed_id',
        (await adminClient.from('hostel_beds').select('id').eq('room_id', room.id)).data?.map(b => b.id) ?? []
      )

    const roommates = (roommateRows ?? []).map(r => {
      const name = (r as any).profiles?.full_name ?? 'Roommate'
      const parts = name.trim().split(' ')
      return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name
    })

    // Latest roll-call entry for this student, if any session has run.
    const { data: latestEntry } = await adminClient
      .from('hostel_roll_call_entries')
      .select('status, recorded_at, hostel_roll_call_sessions!inner ( session_type, session_date, hostel_id )')
      .eq('student_id', user.id)
      .eq('hostel_roll_call_sessions.hostel_id', hostel.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      boarding: true,
      hostel: hostel.name,
      hostelId: hostel.id,
      block: block.name,
      room: room.name,
      bed: bed.label,
      roommates,
      latestRollCall: latestEntry ? {
        status: latestEntry.status,
        sessionType: (latestEntry as any).hostel_roll_call_sessions.session_type,
        sessionDate: (latestEntry as any).hostel_roll_call_sessions.session_date,
      } : null,
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
