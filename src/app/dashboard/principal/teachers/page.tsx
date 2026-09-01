// src/app/dashboard/principal/teachers/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeachersClient from './TeachersClient'

export interface TeacherRow {
  id: string; full_name: string; email: string; phone: string | null
  subjects: string[]; classes: string[]
  last_activity: string | null; last_action: string | null
  notes_uploaded: number; results_posted: number; is_active: boolean
  employee_id: string | null; qualification: string | null
  class_assignments: { class_name: string; subject: string | null; is_primary: boolean }[]
}

export default async function TeachersPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || !['principal','admin'].includes((profile as any).role)) redirect('/dashboard/student')
  const schoolId = (profile as any).school_id
  const school = (profile as any)?.schools ?? null

  const { data: teachers } = await supabase
    .from('profiles').select('id,full_name,email,phone,is_active').eq('role','teacher').eq('school_id', schoolId).order('full_name')

  const teacherIds = (teachers ?? []).map((t: any) => t.id)
  if (!teacherIds.length) return <TeachersClient teachers={[]} profile={profile} school={school} userId={user.id} />

  const [activityRes, csRes, ctRes, tpRes] = await Promise.all([
    supabase.from('teacher_activity_log').select('teacher_id,action,created_at').in('teacher_id', teacherIds).order('created_at', { ascending: false }),
    supabase.from('class_subjects').select('teacher_id,subjects(name),classes(name)').in('teacher_id', teacherIds),
    supabase.from('class_teachers').select('teacher_id,subject,is_primary,classes(name)').in('teacher_id', teacherIds),
    supabase.from('teacher_profiles').select('id,staff_id,qualifications').in('id', teacherIds),
  ])

  // Latest activity per teacher
  const lastActivity: Record<string, { ts: string; action: string }> = {}
  ;(activityRes.data ?? []).forEach((a: any) => {
    if (!lastActivity[a.teacher_id]) lastActivity[a.teacher_id] = { ts: a.created_at, action: a.action }
  })

  // Count notes & results per teacher
  const [notesRes, resultsRes] = await Promise.all([
    supabase.from('notes').select('teacher_id').in('teacher_id', teacherIds),
    supabase.from('results').select('class_subject_id, class_subjects!inner(teacher_id)').in('class_subjects.teacher_id', teacherIds),
  ])
  const notesCounts: Record<string, number> = {}
  ;(notesRes.data ?? []).forEach((n: any) => { notesCounts[n.teacher_id] = (notesCounts[n.teacher_id] ?? 0) + 1 })
  const resultsCounts: Record<string, number> = {}
  ;(resultsRes.data ?? []).forEach((r: any) => {
    const tid = (r as any).class_subjects?.teacher_id
    if (tid) resultsCounts[tid] = (resultsCounts[tid] ?? 0) + 1
  })

  // Subject/class map
  const subjectMap: Record<string, Set<string>> = {}
  const classMap: Record<string, Set<string>> = {}
  ;(csRes.data ?? []).forEach((cs: any) => {
    if (!subjectMap[cs.teacher_id]) subjectMap[cs.teacher_id] = new Set()
    if (!classMap[cs.teacher_id]) classMap[cs.teacher_id] = new Set()
    if (cs.subjects?.name) subjectMap[cs.teacher_id].add(cs.subjects.name)
    if (cs.classes?.name) classMap[cs.teacher_id].add(cs.classes.name)
  })

  // Class assignments (class_teachers already carries subject + is_primary directly)
  const assignmentsMap: Record<string, { class_name: string; subject: string | null; is_primary: boolean }[]> = {}
  ;(ctRes.data ?? []).forEach((ct: any) => {
    if (!assignmentsMap[ct.teacher_id]) assignmentsMap[ct.teacher_id] = []
    assignmentsMap[ct.teacher_id].push({
      class_name: ct.classes?.name ?? 'Unknown class',
      subject: ct.subject ?? null,
      is_primary: ct.is_primary === true,
    })
  })

  // Employee ID / qualification (teacher_profiles is a 1:1 extension table keyed on profiles.id)
  const teacherProfileMap: Record<string, { staff_id: string | null; qualifications: string | null }> = {}
  ;(tpRes.data ?? []).forEach((tp: any) => {
    teacherProfileMap[tp.id] = { staff_id: tp.staff_id ?? null, qualifications: tp.qualifications ?? null }
  })

  const rows: TeacherRow[] = (teachers ?? []).map((t: any) => ({
    id: t.id, full_name: t.full_name ?? 'Unknown', email: t.email ?? '',
    phone: t.phone ?? null, is_active: t.is_active !== false,
    subjects: Array.from(subjectMap[t.id] ?? []),
    classes: Array.from(classMap[t.id] ?? []),
    last_activity: lastActivity[t.id]?.ts ?? null,
    last_action: lastActivity[t.id]?.action ?? null,
    notes_uploaded: notesCounts[t.id] ?? 0,
    results_posted: resultsCounts[t.id] ?? 0,
    employee_id: teacherProfileMap[t.id]?.staff_id ?? null,
    qualification: teacherProfileMap[t.id]?.qualifications ?? null,
    class_assignments: assignmentsMap[t.id] ?? [],
  }))

  return <TeachersClient teachers={rows} profile={profile} school={school} userId={user.id} />
}
