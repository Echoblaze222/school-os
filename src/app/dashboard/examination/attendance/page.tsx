// src/app/dashboard/examination/attendance/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import AttendanceClient from './AttendanceClient'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'

export default async function ExamAttendancePage() {
  const { supabase, userId, profile, school, schoolId, role, can } = await getExamContext()

  // Coordination roles + principal see every sitting; an invigilator only
  // ever sees the sittings they are actually assigned to, this mirrors
  // the RLS floor in lane-c-examination-schema.sql (is_assigned_invigilator),
  // it isn't just a UI convenience filter.
  const canSeeAll = can('manage_exams') || role === 'principal'

  let timetableQuery = supabase
    .from('exam_timetable')
    .select('id, exam_date, start_time, end_time, class_subject_id, class_subjects(classes(id, name), subjects(name))')
    .eq('school_id', schoolId)
    .order('exam_date', { ascending: false })
    .limit(30)

  if (!canSeeAll) {
    const { data: myAssignments } = await supabase
      .from('invigilator_assignments')
      .select('exam_timetable_id')
      .eq('school_id', schoolId)
      .eq('profile_id', userId)
    const ids = (myAssignments ?? []).map(a => a.exam_timetable_id)
    if (ids.length === 0) {
      return (
        <AttendanceClient userId={userId} profile={profile} school={school} schoolId={schoolId}
          timetable={[]} initialRoster={{}} initialAttendance={{}} />
      )
    }
    timetableQuery = timetableQuery.in('id', ids)
  }

  const { data: timetable } = await timetableQuery
  const timetableRows = (timetable ?? []).map((t: any) => ({ ...t, class_subjects: unwrapEmbed(t.class_subjects) }))

  // Roster per sitting = every student in that class.
  const classIds = [...new Set(timetableRows.map((t: any) => unwrapEmbed(t.class_subjects?.classes)?.id).filter(Boolean))]
  const { data: students } = classIds.length
    ? await supabase.from('profiles').select('id, full_name, class_id').eq('role', 'student').in('class_id', classIds)
    : { data: [] }

  const rosterByClass: Record<string, { id: string; full_name: string }[]> = {}
  for (const s of students ?? []) {
    const cid = (s as any).class_id
    if (!rosterByClass[cid]) rosterByClass[cid] = []
    rosterByClass[cid].push(s as any)
  }

  const timetableIds = timetableRows.map((t: any) => t.id)
  const { data: attendanceRows } = timetableIds.length
    ? await supabase.from('exam_attendance').select('id, exam_timetable_id, student_id, status').in('exam_timetable_id', timetableIds)
    : { data: [] }

  const attendanceBySitting: Record<string, Record<string, { id: string; status: string }>> = {}
  for (const a of attendanceRows ?? []) {
    const row: any = a
    if (!attendanceBySitting[row.exam_timetable_id]) attendanceBySitting[row.exam_timetable_id] = {}
    attendanceBySitting[row.exam_timetable_id][row.student_id] = { id: row.id, status: row.status }
  }

  const roster: Record<string, { id: string; full_name: string }[]> = {}
  for (const t of timetableRows as any[]) {
    const cid = unwrapEmbed(t.class_subjects?.classes)?.id
    roster[t.id] = cid ? (rosterByClass[cid] ?? []) : []
  }

  return (
    <AttendanceClient
      userId={userId} profile={profile} school={school} schoolId={schoolId}
      timetable={timetableRows.map((t: any) => ({
        ...t,
        class_subjects: t.class_subjects
          ? { classes: unwrapEmbed(t.class_subjects.classes), subjects: unwrapEmbed(t.class_subjects.subjects) }
          : null,
      }))}
      initialRoster={roster} initialAttendance={attendanceBySitting}
    />
  )
}
