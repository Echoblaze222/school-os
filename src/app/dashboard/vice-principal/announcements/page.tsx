// src/app/dashboard/vice-principal/announcements/page.tsx

import { requireAppointmentPage } from '@/lib/permissions'
import { listDepartments } from '@/lib/supabase/appointments'
import AnnouncementsClient from './AnnouncementsClient'

export default async function VpAnnouncementsPage() {
  const { supabase, ctx, appointment } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  const scope = (appointment.scope ?? {}) as { department_ids?: string[] }
  const scopedDepartmentIds = Array.from(new Set<string>([
    ...(appointment.department_id ? [appointment.department_id] : []),
    ...(Array.isArray(scope.department_ids) ? scope.department_ids : []),
  ]))

  const allDepartments = await listDepartments(supabase, ctx.schoolId)

  return (
    <AnnouncementsClient
      profile={profile} school={school} userId={ctx.userId}
      departments={allDepartments}
      scopedDepartmentIds={scopedDepartmentIds}
    />
  )
}
