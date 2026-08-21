// src/app/dashboard/examination/timetable/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import TimetableClient from './TimetableClient'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'

export default async function ExamTimetablePage() {
  const { supabase, userId, profile, school, schoolId, can } = await getExamContext()

  const [{ data: sessions }, { data: rooms }, { data: classSubjects }, { data: timetable }] = await Promise.all([
    supabase.from('exam_sessions').select('id, name, status').eq('school_id', schoolId).in('status', ['draft', 'scheduled', 'ongoing']).order('start_date', { ascending: false }),
    supabase.from('exam_rooms').select('id, name, capacity').eq('school_id', schoolId).order('name'),
    supabase.from('class_subjects').select('id, classes!inner(id, name, school_id), subjects(id, name)').eq('classes.school_id', schoolId),
    supabase.from('exam_timetable')
      .select('id, exam_session_id, exam_date, start_time, end_time, max_score, status, room_id, exam_rooms(name), class_subjects(classes(name), subjects(name))')
      .eq('school_id', schoolId)
      .order('exam_date', { ascending: true }),
  ])

  return (
    <TimetableClient
      userId={userId}
      profile={profile}
      school={school}
      schoolId={schoolId}
      sessions={sessions ?? []}
      rooms={rooms ?? []}
      classSubjects={(classSubjects ?? [])
        .map((cs: any) => ({ id: cs.id, classes: unwrapEmbed(cs.classes), subjects: unwrapEmbed(cs.subjects) }))
        .filter((cs: any) => cs.classes && cs.subjects)}
      initialTimetable={(timetable ?? []).map((t: any) => ({
        ...t,
        exam_rooms: unwrapEmbed(t.exam_rooms),
        class_subjects: unwrapEmbed(t.class_subjects)
          ? { classes: unwrapEmbed(unwrapEmbed(t.class_subjects).classes), subjects: unwrapEmbed(unwrapEmbed(t.class_subjects).subjects) }
          : null,
      }))}
      canManage={can('manage_exams')}
    />
  )
}
