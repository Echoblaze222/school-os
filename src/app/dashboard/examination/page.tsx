// src/app/dashboard/examination/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import ExaminationDashboardClient from './ExaminationDashboardClient'

export default async function ExaminationDashboardPage() {
  const { supabase, userId, profile, school, schoolId, appointmentLabels, can } = await getExamContext()

  const todayIso = new Date().toISOString().slice(0, 10)
  const weekAheadIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    { data: activeSession },
    { count: upcomingExamCount },
    { count: pendingVerificationCount },
    { count: openIncidentCount },
    { count: myDutyCount },
    { data: myUpcomingDuties },
  ] = await Promise.all([
    supabase.from('exam_sessions')
      .select('id, name, term, academic_year, start_date, end_date, status')
      .eq('school_id', schoolId)
      .in('status', ['scheduled', 'ongoing'])
      .order('start_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from('exam_timetable')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .gte('exam_date', todayIso)
      .lte('exam_date', weekAheadIso),
    supabase.from('results')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('approved', true)
      .eq('verified', false),
    supabase.from('exam_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .in('status', ['reported', 'under_review']),
    supabase.from('invigilator_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('profile_id', userId)
      .in('status', ['assigned', 'confirmed']),
    supabase.from('invigilator_assignments')
      .select('id, status, room_id, exam_timetable(id, exam_date, start_time, end_time, class_subjects(subjects(name), classes(name)))')
      .eq('school_id', schoolId)
      .eq('profile_id', userId)
      .in('status', ['assigned', 'confirmed'])
      .order('assigned_at', { ascending: false })
      .limit(5),
  ])

  return (
    <ExaminationDashboardClient
      userId={userId}
      profile={profile}
      school={school}
      appointmentLabels={appointmentLabels}
      activeSession={activeSession}
      upcomingExamCount={upcomingExamCount ?? 0}
      pendingVerificationCount={can('verify_results') ? (pendingVerificationCount ?? 0) : 0}
      openIncidentCount={openIncidentCount ?? 0}
      myDutyCount={myDutyCount ?? 0}
      myUpcomingDuties={myUpcomingDuties ?? []}
      capabilities={{
        manageExams:        can('manage_exams'),
        assignInvigilators: can('assign_invigilators'),
        createDocuments:    can('create_documents'),
        reviewDocuments:    can('review_documents'),
        enterResults:       can('enter_results'),
        verifyResults:      can('verify_results'),
        publishResults:     can('publish_results'),
        resolveIncident:    can('resolve_incident'),
      }}
    />
  )
}
