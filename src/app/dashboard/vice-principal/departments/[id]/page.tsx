// src/app/dashboard/vice-principal/departments/[id]/page.tsx

import { notFound } from 'next/navigation'
import { requireAppointmentPage, canManageDepartmentWork } from '@/lib/permissions'
import {
  getDepartmentMembers,
} from '@/lib/supabase/appointments'
import {
  listObjectives, listTasks, listReports, listSchedule, getDepartmentPerformance,
} from '@/lib/supabase/departmentWork'
import DepartmentDetailClient from './DepartmentDetailClient'

export default async function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, ctx } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  const { data: department } = await supabase
    .from('departments').select('*').eq('id', id).eq('school_id', ctx.schoolId).single()
  if (!department) notFound()

  const canManage = canManageDepartmentWork(ctx, id) === 'vice_principal'

  const [members, objectives, tasks, reports, schedule, performance] = await Promise.all([
    getDepartmentMembers(supabase, ctx.schoolId, id),
    listObjectives(supabase, id),
    listTasks(supabase, id),
    listReports(supabase, id),
    listSchedule(supabase, id),
    getDepartmentPerformance(supabase, ctx.schoolId, id),
  ])

  return (
    <DepartmentDetailClient
      profile={profile} school={school} userId={ctx.userId}
      department={department}
      canManage={canManage}
      initialMembers={members}
      initialObjectives={objectives}
      initialTasks={tasks}
      initialReports={reports}
      initialSchedule={schedule}
      performance={performance}
    />
  )
}
