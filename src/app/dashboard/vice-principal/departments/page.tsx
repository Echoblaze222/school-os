// src/app/dashboard/vice-principal/departments/page.tsx

import { requireAppointmentPage } from '@/lib/permissions'
import { listDepartments } from '@/lib/supabase/appointments'
import DepartmentsClient from './DepartmentsClient'

export default async function VpDepartmentsPage() {
  const { supabase, ctx, appointment } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  const departments = await listDepartments(supabase, ctx.schoolId)

  const scope = (appointment.scope ?? {}) as { department_ids?: string[] }
  const scopedDepartmentIds = Array.from(new Set<string>([
    ...(appointment.department_id ? [appointment.department_id] : []),
    ...(Array.isArray(scope.department_ids) ? scope.department_ids : []),
  ]))

  return (
    <DepartmentsClient
      profile={profile}
      school={school}
      userId={ctx.userId}
      initialDepartments={departments}
      scopedDepartmentIds={scopedDepartmentIds}
    />
  )
}
