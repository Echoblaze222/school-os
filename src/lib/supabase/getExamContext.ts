// lib/supabase/getExamContext.ts
// -------------------------------------------------------
// Shared server-side loader for every page under
// src/app/dashboard/examination/. One place to get:
//   - the authenticated profile + school (redirects to /login if none)
//   - this profile's active exam-committee appointments
//   - a bound `can(capability)` check (examPermissions.ts)
// Every examination page.tsx should call this FIRST, before any other
// query, and redirect if `isOnCommittee` is false and role isn't
// principal — this is the inner floor beneath middleware's outer check,
// per "hidden nav item is not a security boundary" (neither check alone
// is enough; both must independently hold).
//
// The user/profile/school portion is sourced from getAuthedProfile()
// (src/lib/auth/getAuthedProfile.ts) rather than its own separate query -
// examination/layout.tsx (which runs on this same request, just before
// any page that calls this function) needs the exact same data. Both are
// wrapped in React's cache(), so this now does that lookup once per
// request instead of twice.
// -------------------------------------------------------

import { createClient } from './server'
import { redirect } from 'next/navigation'
import { hasExamCapability, isOnExamCommittee, type ExamCapability, type ActiveAppointment } from './examPermissions'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from './appointments-types'
import { getAuthedProfile } from '@/lib/auth/getAuthedProfile'

export interface ExamContext {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  profile: any
  school: any
  schoolId: string
  role: string
  appointments: ActiveAppointment[]
  appointmentLabels: string[]
  can: (capability: ExamCapability) => boolean
}

export async function getExamContext(): Promise<ExamContext> {
  const { user, profile, school } = await getAuthedProfile()
  if (!user) redirect('/login')
  if (!profile) redirect('/login')

  // Still needed - the returned ExamContext hands back a live client for
  // every examination page's own queries (see examination/page.tsx),
  // getAuthedProfile only resolves data, not a reusable client instance.
  const supabase = await createClient()

  const schoolId = school?.id ?? profile.school_id ?? ''
  const role     = profile.role as string

  const { data: appts } = await supabase
    .from('appointments')
    .select('appointment_type, status')
    .eq('profile_id', user.id)
    .eq('status', 'active')

  const appointments: ActiveAppointment[] = (appts ?? []) as ActiveAppointment[]

  // Inner access-control floor. Middleware already checked this once at
  // the route level; re-checking here means a direct server-render (or a
  // future change to middleware's matcher) can never silently skip it.
  if (role !== 'principal' && !isOnExamCommittee(appointments)) {
    redirect('/dashboard/teacher')
  }

  const appointmentLabels = appointments
    .map(a => APPOINTMENT_TYPES[a.appointment_type as AppointmentTypeId]?.label)
    .filter(Boolean) as string[]

  return {
    supabase,
    userId: user.id,
    profile,
    school,
    schoolId,
    role,
    appointments,
    appointmentLabels,
    can: (capability: ExamCapability) => hasExamCapability(capability, role, appointments),
  }
}
