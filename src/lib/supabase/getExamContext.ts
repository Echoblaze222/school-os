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
// C2 security remediation: this was select('*, schools(*)') - profiles
// also holds nin/nin_number/nin_screenshot_url/pin_hash/secret_identifier/
// temp_password/address/date_of_birth/etc, none of which anything under
// examination/ uses. Audited every consumer (dashboard, ai, chat,
// results, sessions, meetings, timetable, documents, incidents,
// attendance, invigilation, notifications, profile) before narrowing:
// every one of them only ever reads full_name/email/phone/avatar_url/
// role/school_id from `profile`, via RoleSubHeader/DashboardHeader/
// UniversalAIPage/UniversalChatPage/StaffMeetingsClient, or this
// function's own role/school_id derivation below - all already covered
// by SELF_PROFILE_SAFE_COLUMNS. No consumer needed a role-specific
// extra field (unlike e.g. teacher/profile's qualification/employee_id),
// so no additions were needed here, unlike some of the per-role profile
// pages.
// -------------------------------------------------------

import { createClient } from './server'
import { redirect } from 'next/navigation'
import { hasExamCapability, isOnExamCommittee, type ExamCapability, type ActiveAppointment } from './examPermissions'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from './appointments-types'
import { SELF_PROFILE_SAFE_COLUMNS } from './profileSelectors'

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
    .select(`${SELF_PROFILE_SAFE_COLUMNS}, schools(*)`)
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
