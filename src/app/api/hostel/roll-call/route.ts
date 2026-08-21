// src/app/api/hostel/roll-call/route.ts
// §17: hostel roll call. Statuses: present, absent, excused, on_leave,
// late, unknown. A student left `unknown` when a session closes is
// exactly the "expected in hostel but not accounted for" exception §17
// asks to flag: the dashboard summary route already reads that
// condition directly from this table, no separate flag column needed.
//
// GET  ?hostelId=&date=&sessionType=  -> session + entries (auto-creates
//   the session with one 'unknown' entry per currently-assigned student
//   if it doesn't exist yet for that hostel/type/date, so staff always
//   have a full roster to work from rather than an empty list)
// POST -> record one entry's status, or close the session

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireHostelStaff, getActiveAppointment, getHostelPrefectScope } from '@/lib/permissions'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Hostel Prefect fallback: no full staff appointment, but an active
 * hostel_prefect appointment scoped to this specific hostel. Returns the
 * caller's profile if so, null otherwise - same shape callers need as
 * requireHostelStaff's `auth.profile`, so both paths compose the same way
 * in GET/POST below.
 */
async function getHostelPrefectForHostel(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  hostelId: string,
) {
  const { data: profile } = await adminClient
    .from('profiles').select('id, role, school_id').eq('id', userId).single()
  if (!profile) return null

  const appointment = await getActiveAppointment(adminClient, profile.id, profile.school_id, ['hostel_prefect'])
  if (!appointment) return null

  const { hostelIds } = getHostelPrefectScope(appointment)
  if (!hostelIds.includes(hostelId)) return null

  return profile
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()

    const { searchParams } = new URL(request.url)
    const hostelId = searchParams.get('hostelId')
    const sessionType = searchParams.get('sessionType') // morning|afternoon|evening|night
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

    if (!hostelId || !sessionType) {
      return NextResponse.json({ error: 'hostelId and sessionType are required.' }, { status: 400 })
    }

    const staffAuth = await requireHostelStaff(adminClient, user.id)
    const prefectProfile = staffAuth ? null : await getHostelPrefectForHostel(adminClient, user.id, hostelId)
    const callerProfile = staffAuth?.profile ?? prefectProfile
    if (!callerProfile) {
      return NextResponse.json({ error: 'You do not have hostel access.' }, { status: 403 })
    }

    // Confirm the hostel belongs to the caller's school before touching anything
    const { data: hostel } = await adminClient
      .from('hostels').select('id, school_id, name').eq('id', hostelId).maybeSingle()
    if (!hostel || hostel.school_id !== callerProfile.school_id) {
      return NextResponse.json({ error: 'Hostel not found.' }, { status: 404 })
    }

    let { data: session } = await adminClient
      .from('hostel_roll_call_sessions')
      .select('id, status, session_date, session_type, opened_at, closed_at')
      .eq('hostel_id', hostelId).eq('session_type', sessionType).eq('session_date', date)
      .maybeSingle()

    if (!session) {
      const { data: newSession, error: createErr } = await adminClient
        .from('hostel_roll_call_sessions')
        .insert({ school_id: callerProfile.school_id, hostel_id: hostelId, session_type: sessionType, session_date: date, opened_by: user.id })
        .select('id, status, session_date, session_type, opened_at, closed_at')
        .single()
      if (createErr || !newSession) {
        return NextResponse.json({ error: 'Could not open a roll call session.' }, { status: 500 })
      }
      session = newSession

      // Seed one 'unknown' entry per student currently assigned to a bed
      // in this hostel, so staff see a full roster, not an empty list.
      const { data: assignedStudents } = await adminClient
        .from('hostel_bed_assignments')
        .select('student_id, hostel_beds!inner(room_id, hostel_rooms!inner(block_id, hostel_blocks!inner(hostel_id)))')
        .eq('status', 'active')
        .eq('hostel_beds.hostel_rooms.hostel_blocks.hostel_id', hostelId)

      const rows = (assignedStudents ?? []).map(s => ({ session_id: session!.id, student_id: s.student_id }))
      if (rows.length > 0) {
        await adminClient.from('hostel_roll_call_entries').insert(rows)
      }
    }

    const { data: entries } = await adminClient
      .from('hostel_roll_call_entries')
      .select('id, student_id, status, note, recorded_at, profiles:student_id ( id, full_name )')
      .eq('session_id', session.id)
      .order('recorded_at', { ascending: true })

    return NextResponse.json({ hostelName: hostel.name, session, entries: entries ?? [] })

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

    const staffAuth = await requireHostelStaff(adminClient, user.id)
    const body = await request.json()
    const { action, sessionId, entryId, status, note } = body

    if (staffAuth) {
      // Full hostel staff: every action below, no scope restriction beyond
      // the hostel-belongs-to-caller's-school check already inside
      // requireHostelStaff's underlying appointment/school lookup.
    } else {
      // Not staff - only a Hostel Prefect recording an entry within their
      // own assigned hostel(s) is allowed past this point. 'close' (and
      // anything else) stays staff-only: closing a session is a
      // supervisory action, not attendance-marking.
      if (action !== 'record') {
        return NextResponse.json({ error: 'You do not have hostel staff access.' }, { status: 403 })
      }

      const { data: profile } = await adminClient
        .from('profiles').select('id, school_id').eq('id', user.id).single()
      const appointment = profile
        ? await getActiveAppointment(adminClient, profile.id, profile.school_id, ['hostel_prefect'])
        : null
      if (!profile || !appointment) {
        return NextResponse.json({ error: 'You do not have hostel access.' }, { status: 403 })
      }

      const { hostelIds } = getHostelPrefectScope(appointment)
      if (!hostelIds.length || !entryId) {
        return NextResponse.json({ error: 'You do not have hostel access.' }, { status: 403 })
      }

      // Resolve the entry's session -> hostel_id and confirm it's within
      // this prefect's scope before letting them touch it - entryId comes
      // from the client, never trust it maps to an in-scope hostel.
      const { data: entryRow } = await adminClient
        .from('hostel_roll_call_entries')
        .select('id, hostel_roll_call_sessions!inner(hostel_id)')
        .eq('id', entryId)
        .maybeSingle()
      const entryHostelId = (entryRow as any)?.hostel_roll_call_sessions?.hostel_id
      if (!entryHostelId || !hostelIds.includes(entryHostelId)) {
        return NextResponse.json({ error: 'That entry is outside your assigned hostel.' }, { status: 403 })
      }
    }

    if (action === 'record') {
      const validStatuses = ['present', 'absent', 'excused', 'on_leave', 'late', 'unknown']
      if (!entryId || !validStatuses.includes(status)) {
        return NextResponse.json({ error: 'A valid entryId and status are required.' }, { status: 400 })
      }
      const { error } = await adminClient
        .from('hostel_roll_call_entries')
        .update({ status, note: note ?? null, recorded_by: user.id, recorded_at: new Date().toISOString() })
        .eq('id', entryId)
      if (error) return NextResponse.json({ error: 'Could not save that entry.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'close') {
      if (!sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
      const { error } = await adminClient
        .from('hostel_roll_call_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (error) return NextResponse.json({ error: 'Could not close the session.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
