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
import LeadershipClient from './LeadershipClient'

export default async function LeadershipPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || (profile as any).role !== 'principal') redirect('/login')
  const school = (profile as any)?.schools ?? null
  const schoolId = (profile as any).school_id

  const [departments, { data: vpAppointments }, { data: hostels }, { data: hpAppointments }] = await Promise.all([
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

  return (
    <LeadershipClient
      profile={profile} school={school} userId={user.id}
      initialDepartments={departments}
      initialVicePrincipals={vicePrincipals}
      initialHostels={hostels ?? []}
      initialHostelPrefects={hostelPrefects}
    />
  )
}
