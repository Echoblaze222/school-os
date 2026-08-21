// src/app/api/hostel/rooms/route.ts
// §14: hostel/block/room/bed structure, and bed assignment.
// GET  -> full structure with occupancy for the caller's school
// POST -> assign a student to a bed, or vacate a bed
//   body: { action: 'assign', bedId, studentId } | { action: 'vacate', bedId }
//
// Double-assignment is prevented at the database level (see
// idx_one_active_assignment_per_bed / _per_student in hostel-schema.sql),
// not just here: this check exists to return a clear error message
// instead of a raw constraint-violation, not as the only safeguard.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireHostelStaff } from '@/lib/permissions'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()

    const auth = await requireHostelStaff(adminClient, user.id)
    if (!auth) return NextResponse.json({ error: 'You do not have hostel staff access.' }, { status: 403 })

    // Note: nested hostel_bed_assignments includes vacated rows too (Supabase's
    // nested-select filtering doesn't cleanly scope a status filter onto a
    // deeply nested relation): the client only reads the entry where
    // status === 'active', since a bed's unique index guarantees at most one.
    const { data: hostels, error } = await adminClient
      .from('hostels')
      .select(`
        id, name, gender,
        hostel_blocks (
          id, name,
          hostel_rooms (
            id, name, capacity, status,
            hostel_beds (
              id, label, status,
              hostel_bed_assignments ( id, student_id, status,
                profiles:student_id ( id, full_name )
              )
            )
          )
        )
      `)
      .eq('school_id', auth.profile.school_id)
      .order('name')

    if (error) {
      console.error('[hostel/rooms GET]', error.message)
      return NextResponse.json({ error: 'Could not load hostel structure.' }, { status: 500 })
    }

    return NextResponse.json({ hostels: hostels ?? [] })

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
    const { action, bedId, studentId } = body

    if (action === 'assign') {
      if (!bedId || !studentId) {
        return NextResponse.json({ error: 'bedId and studentId are required.' }, { status: 400 })
      }

      // Pre-check for a clear error message (see comment at top of file
      // for why the DB constraint is the real safeguard, not this).
      const { data: bed } = await adminClient
        .from('hostel_beds').select('id, status').eq('id', bedId).maybeSingle()
      if (!bed) return NextResponse.json({ error: 'Bed not found.' }, { status: 404 })
      if (bed.status === 'occupied') {
        return NextResponse.json(
          { error: 'This bed is already occupied. Vacate it first before reassigning.' },
          { status: 409 }
        )
      }
      const { data: existing } = await adminClient
        .from('hostel_bed_assignments')
        .select('id').eq('student_id', studentId).eq('status', 'active').maybeSingle()
      if (existing) {
        return NextResponse.json(
          { error: 'This student is already assigned to a bed. Vacate their current bed first.' },
          { status: 409 }
        )
      }

      const { error: insertErr } = await adminClient
        .from('hostel_bed_assignments')
        .insert({ bed_id: bedId, student_id: studentId, assigned_by: user.id })
      if (insertErr) {
        // Covers the race-condition case the pre-checks above can't :
        // two staff assigning the same bed at the same moment.
        return NextResponse.json(
          { error: 'Could not complete the assignment. The bed or student may have just been assigned elsewhere.' },
          { status: 409 }
        )
      }

      await adminClient.from('hostel_beds').update({ status: 'occupied' }).eq('id', bedId)

      return NextResponse.json({ success: true })
    }

    if (action === 'vacate') {
      if (!bedId) return NextResponse.json({ error: 'bedId is required.' }, { status: 400 })

      await adminClient
        .from('hostel_bed_assignments')
        .update({ status: 'vacated', vacated_at: new Date().toISOString() })
        .eq('bed_id', bedId).eq('status', 'active')

      await adminClient.from('hostel_beds').update({ status: 'available' }).eq('id', bedId)

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
