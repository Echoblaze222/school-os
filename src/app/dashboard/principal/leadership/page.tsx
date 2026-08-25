// src/app/dashboard/principal/leadership/page.tsx
// Where a Principal appoints Vice Principals and configures departments/
// HODs directly. Necessary addition, not scope creep: without an entry
// point to create the first 'vice_principal' appointment, nothing built
// in dashboard/vice-principal/ is reachable by anyone. Reuses the same
// components/org and lib/supabase/appointments building blocks Lane A
// built for the Vice Principal side, rather than duplicating them.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listDepartments } from '@/lib/supabase/appointments'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from '@/lib/supabase/appointments-types'
import LeadershipClient from './LeadershipClient'

// Belt-and-suspenders against a stale client Router Cache snapshot
// showing after appointing someone then navigating away and back -
// cookies() in createClient() already forces this route to render fresh
// on the server every request, but that alone doesn't stop the browser
// from reusing a cached RSC payload from before the mutation. Explicit
// here rather than relying on the implicit cookies()-forces-dynamic
// behavior, since that's easy to lose silently in a future refactor.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Every AppointmentTypeId this page doesn't already give bespoke UI to
// (Vice Principal, HOD, Hostel Prefect each have their own section/modal
// with type-specific scope inputs). Everything else renders through the
// generic AppointmentTypeSection below, grouped by category.
const GENERIC_TYPES = (Object.keys(APPOINTMENT_TYPES) as AppointmentTypeId[])
  .filter(id => !['vice_principal', 'hod', 'hostel_prefect'].includes(id))

export default async function LeadershipPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || (profile as any).role !== 'principal') redirect('/login')
  const school = (profile as any)?.schools ?? null
  const schoolId = (profile as any).school_id

  const [departments, { data: vpAppointments }, { data: hostels }, { data: hpAppointments }, { data: classes }, { data: genericAppointments }] = await Promise.all([
    listDepartments(supabase, schoolId),
    supabase
      .from('appointments')
      .select('id, department_id, scope, assigned_at, profiles(id, full_name, avatar_url, email)')
      .eq('school_id', schoolId)
      .eq('appointment_type', 'vice_principal')
      .eq('status', 'active'),
    supabase.from('hostels').select('id, name').eq('school_id', schoolId).order('name'),
    supabase
      .from('appointments')
      .select('id, scope, assigned_at, profiles(id, full_name, avatar_url)')
      .eq('school_id', schoolId)
      .eq('appointment_type', 'hostel_prefect')
      .eq('status', 'active'),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).eq('is_active', true).order('name'),
    supabase
      .from('appointments')
      .select('id, appointment_type, scope, assigned_at, profiles(id, full_name, avatar_url)')
      .eq('school_id', schoolId)
      .in('appointment_type', GENERIC_TYPES)
      .eq('status', 'active'),
  ])

  const vicePrincipals = (vpAppointments ?? []).map((a: any) => {
    const person = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
    return {
      appointmentId: a.id,
      profileId: person?.id,
      fullName: person?.full_name ?? 'Unknown',
      avatarUrl: person?.avatar_url ?? null,
      email: person?.email ?? '',
      portfolio: a.scope?.portfolio ?? null,
      departmentIds: Array.from(new Set<string>([
        ...(a.department_id ? [a.department_id] : []),
        ...(Array.isArray(a.scope?.department_ids) ? a.scope.department_ids : []),
      ])),
      assignedAt: a.assigned_at,
    }
  })

  const hostelPrefects = (hpAppointments ?? []).map((a: any) => {
    const person = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
    return {
      appointmentId: a.id,
      profileId: person?.id,
      fullName: person?.full_name ?? 'Unknown',
      avatarUrl: person?.avatar_url ?? null,
      hostelIds: Array.isArray(a.scope?.hostel_ids) ? a.scope.hostel_ids : [],
      assignedAt: a.assigned_at,
    }
  })

  // Group the 16 "generic" types' appointments by type so the client
  // doesn't have to - GENERIC_TYPES.filter keeps every type present as a
  // key even with zero holders, so each section renders its empty state
  // instead of not rendering at all.
  const genericAppointmentsByType: Record<string, any[]> = Object.fromEntries(GENERIC_TYPES.map(t => [t, []]))
  for (const a of genericAppointments ?? []) {
    const person = Array.isArray((a as any).profiles) ? (a as any).profiles[0] : (a as any).profiles
    genericAppointmentsByType[(a as any).appointment_type].push({
      appointmentId: a.id,
      profileId: person?.id,
      fullName: person?.full_name ?? 'Unknown',
      avatarUrl: person?.avatar_url ?? null,
      hostelIds: Array.isArray((a as any).scope?.hostel_ids) ? (a as any).scope.hostel_ids : [],
      classIds: Array.isArray((a as any).scope?.class_ids) ? (a as any).scope.class_ids : [],
      assignedAt: a.assigned_at,
    })
  }

  return (
    <LeadershipClient
      profile={profile} school={school} userId={user.id}
      initialDepartments={departments}
      initialVicePrincipals={vicePrincipals}
      initialHostels={hostels ?? []}
      initialHostelPrefects={hostelPrefects}
      initialClasses={classes ?? []}
      initialGenericAppointments={genericAppointmentsByType}
    />
  )
}
