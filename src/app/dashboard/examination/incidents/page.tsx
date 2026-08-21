// src/app/dashboard/examination/incidents/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import IncidentsClient from './IncidentsClient'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'

export default async function ExamIncidentsPage() {
  const { supabase, userId, profile, school, schoolId, can } = await getExamContext()

  const [{ data: incidents }, { data: timetable }] = await Promise.all([
    supabase.from('exam_incidents')
      .select('id, exam_timetable_id, student_id, incident_type, severity, description, status, resolution_notes, resolved_at, created_at, reported_by')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false }),
    supabase.from('exam_timetable')
      .select('id, exam_date, class_subjects(classes(name), subjects(name))')
      .eq('school_id', schoolId)
      .order('exam_date', { ascending: false })
      .limit(50),
  ])

  // exam_incidents has three FKs into profiles (student_id, reported_by,
  // resolved_by), a PostgREST embed would need explicit relationship
  // hints for each, and the same manual-lookup pattern is already used
  // elsewhere in this codebase for results.student_id, so staying
  // consistent rather than introducing a second join style here.
  const rows = incidents ?? []
  const profileIds = [...new Set([
    ...rows.map(r => r.student_id).filter(Boolean),
    ...rows.map(r => r.reported_by).filter(Boolean),
  ])]
  const { data: people } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', profileIds as string[])
    : { data: [] }
  const nameById: Record<string, string> = {}
  for (const p of people ?? []) nameById[(p as any).id] = (p as any).full_name

  return (
    <IncidentsClient
      userId={userId}
      profile={profile}
      school={school}
      schoolId={schoolId}
      timetable={(timetable ?? []).map((t: any) => {
        const cs = unwrapEmbed(t.class_subjects)
        return { ...t, class_subjects: cs ? { classes: unwrapEmbed(cs.classes), subjects: unwrapEmbed(cs.subjects) } : null }
      })}
      initialIncidents={rows.map(r => ({
        ...r,
        student_name: r.student_id ? nameById[r.student_id] ?? 'Unknown' : null,
        reporter_name: nameById[r.reported_by] ?? 'Unknown',
      }))}
      canResolve={can('resolve_incident')}
    />
  )
}
