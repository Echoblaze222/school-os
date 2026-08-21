// src/app/dashboard/examination/sessions/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import SessionsClient from './SessionsClient'

export default async function ExamSessionsPage() {
  const { supabase, userId, profile, school, schoolId, can } = await getExamContext()

  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select('id, name, term, academic_year, start_date, end_date, status, created_at')
    .eq('school_id', schoolId)
    .order('start_date', { ascending: false })

  return (
    <SessionsClient
      userId={userId}
      profile={profile}
      school={school}
      schoolId={schoolId}
      initialSessions={sessions ?? []}
      canManage={can('manage_exams')}
    />
  )
}
