// src/app/api/me/contexts/route.ts
// §23: "the active context must affect navigation, dashboard, available
// actions, API authorization, AI, notifications, search... changing the
// UI context must NEVER be treated as proof of authorization."
//
// This route is deliberately read-only and side-effect-free: it just
// tells the client which dashboards the signed-in user is allowed to
// see links to. It grants nothing by itself: every dashboard page and
// every API route this drives independently re-checks the same
// appointment server-side (see requireHostelStaff, and the leadership
// duties RLS policy). A compromised or stale client response here can,
// at worst, show a broken link: it can never grant access, because
// nothing downstream trusts it.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ROLE_DASHBOARDS } from '@/lib/supabase/types'
import { APPOINTMENT_TYPES, EXAM_APPOINTMENT_TYPES } from '@/lib/supabase/appointments-types'

const HOSTEL_STAFF_TYPES = new Set(['warden', 'assistant_warden', 'house_parent', 'hostel_administrator'])

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role, full_name, school_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

    const contexts: Array<{ id: string; label: string; href: string; kind: 'base' | 'appointment' | 'boarding' }> = [
      {
        id: 'base',
        label: profile.role === 'student' ? 'Student' : (profile.role[0].toUpperCase() + profile.role.slice(1)),
        href: ROLE_DASHBOARDS[profile.role as keyof typeof ROLE_DASHBOARDS] ?? '/dashboard',
        kind: 'base',
      },
    ]

    const { data: appointments } = await adminClient
      .from('appointments')
      .select('id, appointment_type')
      .eq('profile_id', profile.id)
      .eq('status', 'active')

    for (const a of appointments ?? []) {
      const config = APPOINTMENT_TYPES[a.appointment_type as keyof typeof APPOINTMENT_TYPES]
      if (!config) continue // unknown/retired appointment type: skip rather than guess a route

      let href = `/dashboard/student/leadership?appointmentId=${a.id}`
      if (HOSTEL_STAFF_TYPES.has(a.appointment_type)) {
        href = '/dashboard/hostel'
      } else if (a.appointment_type === 'counselor') {
        // Lane B (Counselor) shipped after this route was first written,
        // which is why it was previously falling into the generic
        // "not built yet" skip below. Routes to the real dashboard now;
        // that page independently re-verifies the same active appointment
        // server-side, same as every other destination this route links to.
        href = '/dashboard/counselor'
      } else if (a.appointment_type === 'vice_principal') {
        // Lane A shipped after this route was first written, same story
        // as counselor above.
        href = '/dashboard/vice-principal'
      } else if (EXAM_APPOINTMENT_TYPES.includes(a.appointment_type)) {
        // Lane C shipped after this route was first written. All seven
        // exam-committee appointment types share the one committee
        // dashboard, the page itself tailors what's visible per type.
        href = '/dashboard/examination'
      } else if (a.appointment_type === 'ict_officer' || a.appointment_type === 'ict_administrator') {
        // Lane D shipped after this route was first written, same story.
        href = '/dashboard/ict'
      } else if (config.category !== 'student_leadership') {
        // Any other non-hostel, non-leadership appointment types belong
        // to a lane that hasn't shipped yet: link there once it does.
        // Until then, skip rather than link to a page that doesn't exist.
        continue
      }

      contexts.push({ id: a.id, label: config.label, href, kind: 'appointment' })
    }

    // Boarding context: a student currently holding an active bed
    // assignment. Not an appointment row (§15 treats "boarding" as
    // status, not a title): read directly from Lane E1's table.
    if (profile.role === 'student') {
      const { data: bed } = await adminClient
        .from('hostel_bed_assignments')
        .select('id')
        .eq('student_id', profile.id)
        .eq('status', 'active')
        .maybeSingle()
      if (bed) {
        contexts.push({ id: 'boarding', label: 'Boarding', href: '/dashboard/student/boarding', kind: 'boarding' })
      }
    }

    return NextResponse.json({ contexts })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
