// src/app/dashboard/examination/invigilation/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import InvigilationClient from './InvigilationClient'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'

export default async function InvigilationPage() {
  const { supabase, userId, profile, school, schoolId, can } = await getExamContext()

  const [{ data: timetable }, { data: teachers }, { data: assignments }] = await Promise.all([
    supabase.from('exam_timetable')
      .select('id, exam_date, start_time, end_time, class_subjects(classes(name), subjects(name)), exam_rooms(id, name)')
      .eq('school_id', schoolId)
      .gte('exam_date', new Date().toISOString().slice(0, 10))
      .order('exam_date', { ascending: true }),
    supabase.from('profiles').select('id, full_name').eq('school_id', schoolId).eq('role', 'teacher').order('full_name'),
    supabase.from('invigilator_assignments')
      .select('id, exam_timetable_id, profile_id, room_id, status, profiles!profile_id(full_name), exam_rooms(name)')
      .eq('school_id', schoolId),
  ])

  return (
    <InvigilationClient
      userId={userId}
      profile={profile}
      school={school}
      schoolId={schoolId}
      timetable={(timetable ?? []).map((t: any) => {
        const cs = unwrapEmbed(t.class_subjects)
        return {
          ...t,
          exam_rooms: unwrapEmbed(t.exam_rooms),
          class_subjects: cs ? { classes: unwrapEmbed(cs.classes), subjects: unwrapEmbed(cs.subjects) } : null,
        }
      })}
      teachers={teachers ?? []}
      initialAssignments={(assignments ?? []).map((a: any) => ({
        ...a,
        profiles: unwrapEmbed(a.profiles),
        exam_rooms: unwrapEmbed(a.exam_rooms),
      }))}
      canAssign={can('assign_invigilators')}
    />
  )
}
