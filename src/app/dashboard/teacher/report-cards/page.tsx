// src/app/dashboard/teacher/report-cards/page.tsx
// Only meaningful for the CLASS teacher (is_primary=true in class_teachers) —
// subject teachers don't compile the overall report card.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportCardsClient from './ReportCardsClient'

export default async function TeacherReportCardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || profile.role !== 'teacher') redirect('/login')

  const school   = (profile as any).schools ?? null
  const schoolId = school?.id ?? ''

  // Find the class(es) where this teacher is the CLASS teacher (is_primary)
  const { data: classTeacherRows } = await supabase
    .from('class_teachers')
    .select('class_id, classes ( id, name, class_level, section )')
    .eq('teacher_id', user.id)
    .eq('school_id', schoolId)
    .eq('is_primary', true)

  const classIds = (classTeacherRows ?? []).map((c: any) => c.class_id)

  let students: any[] = []
  if (classIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, default_code, admission_number, class_id')
      .eq('school_id', schoolId)
      .eq('role', 'student')
      .in('class_id', classIds)
      .order('full_name')
    students = data ?? []
  }

  return (
    <ReportCardsClient
      profile={profile}
      school={school}
      teacherId={user.id}
      classes={(classTeacherRows ?? []).map((c: any) => c.classes)}
      students={students}
    />
  )
}
