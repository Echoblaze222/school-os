// src/app/dashboard/student/hostel-roll-call/page.tsx
// Lane 2 (Hostel Prefect Permission): the "fuller hostel-prefect
// experience" both LANE-E1-README.md and LANE-F-README.md flagged as not
// built - a Hostel Prefect held the appointment type but had nowhere to
// actually use it, landing on the generic duties-only Leadership page
// like any other prefect.
//
// This page is the missing UI surface, not a new authorization boundary:
// /api/hostel/roll-call already enforced the exact scoping used here
// (view own assigned hostel, create roll-call entries only, in that
// hostel, nothing else) before this page existed. That route re-verifies
// everything itself on every request, so the checks below exist to
// redirect a non-prefect away with a clear reason - not as the thing
// actually protecting the data.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { resolveUserContext, getAppointment, getHostelPrefectScope } from '@/lib/permissions'
import HostelRollCallClient from './HostelRollCallClient'

export default async function StudentHostelRollCallPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) redirect('/login')

  const appointment = getAppointment(ctx, 'hostel_prefect')
  if (!appointment) redirect('/dashboard/student')

  const { hostelIds } = getHostelPrefectScope(appointment)

  // Re-derive the hostel list from the database rather than trusting the
  // id array alone - the .eq('school_id', ...) here is a second check on
  // top of the one appointment creation already did, so a stale or
  // cross-school id in scope (shouldn't happen, but "shouldn't happen" is
  // not a security boundary) can never surface another school's hostel.
  const adminClient = createAdminClient()
  const hostels = hostelIds.length > 0
    ? (await adminClient
        .from('hostels')
        .select('id, name')
        .eq('school_id', ctx.schoolId)
        .in('id', hostelIds)
        .order('name')).data ?? []
    : []

  return <HostelRollCallClient hostels={hostels} />
}
