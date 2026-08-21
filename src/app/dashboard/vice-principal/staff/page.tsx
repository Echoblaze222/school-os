// src/app/dashboard/vice-principal/staff/page.tsx

import { requireAppointmentPage } from '@/lib/permissions'
import { listDepartments } from '@/lib/supabase/appointments'
import StaffClient from './StaffClient'

export default async function VpStaffPage() {
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  const [{ data: teachers }, departments] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, employee_id, subjects_taught, department_id, last_activity')
      .eq('school_id', ctx.schoolId).eq('role', 'teacher')
      .order('full_name', { ascending: true }),
    listDepartments(supabase, ctx.schoolId),
  ])

  return (
    <StaffClient
      profile={profile}
      school={school}
      userId={ctx.userId}
      initialTeachers={teachers ?? []}
      departments={departments}
    />
  )
}
