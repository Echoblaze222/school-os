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
// -------------------------------------------------------

import { createClient } from './server'
import { redirect } from 'next/navigation'
import { hasExamCapability, isOnExamCommittee, type ExamCapability, type ActiveAppointment } from './examPermissions'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from './appointments-types'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const school   = (profile as any).schools ?? null
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
