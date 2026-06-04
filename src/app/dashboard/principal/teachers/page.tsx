// src/app/dashboard/principal/teachers/page.tsx
// FIX: Subject/class mapping now reads from class_teachers (not class_subjects)
// FIX: role_type exposed so TeachersClient can show Class Teacher vs Subject Teacher

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeachersClient from './TeachersClient'

export interface TeacherRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  employee_id: string | null
  qualification: string | null
  subjects: string[]
  classes: string[]
  // FIX: per-class role breakdown so UI can show "Class Teacher of JSS1A, Subject Teacher of JSS2A (Maths)"
  class_assignments: {
    class_name: string
    subject: string | null
    is_primary: boolean
  }[]
  last_activity: string | null
  last_action: string | null
  notes_uploaded: number
  results_posted: number
  is_active: boolean
}

export default async function TeachersPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['principal', 'admin'].includes((profile as any).role)) {
    redirect('/dashboard/student')
  }

  const schoolId = (profile as any).school_id

  // All teachers at this school
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, employee_id, qualification, is_active')
    .eq('role', 'teacher')
    .eq('school_id', schoolId)
    .order('full_name')

  const teacherIds = (teachers ?? []).map((t: any) => t.id)
  if (!teacherIds.length) return <TeachersClient teachers={[]} />

  // FIX: Read from class_teachers instead of class_subjects
  const [activityRes, ctRes, notesRes, resultsRes] = await Promise.all([
    supabase
      .from('teacher_activity_log')
      .select('teacher_id, action, created_at')
      .in('teacher_id', teacherIds)
      .order('created_at', { ascending: false }),

    // FIX: class_teachers is the source of truth for subject/class assignments
    supabase
      .from('class_teachers')
      .select('teacher_id, subject, is_primary, role_type, classes(name, class_level)')
      .in('teacher_id', teacherIds)
      .eq('school_id', schoolId),

    supabase
      .from('notes')
      .select('teacher_id')
      .in('teacher_id', teacherIds),

    supabase
      .from('results')
      .select('teacher_id')
      .in('teacher_id', teacherIds),
  ])

  // Latest activity per teacher
  const lastActivity: Record<string, { ts: string; action: string }> = {}
  ;(activityRes.data ?? []).forEach((a: any) => {
    if (!lastActivity[a.teacher_id]) {
      lastActivity[a.teacher_id] = { ts: a.created_at, action: a.action }
    }
  })

  // Notes count per teacher
  const notesCounts: Record<string, number> = {}
  ;(notesRes.data ?? []).forEach((n: any) => {
    notesCounts[n.teacher_id] = (notesCounts[n.teacher_id] ?? 0) + 1
  })

  // Results count per teacher
  const resultsCounts: Record<string, number> = {}
  ;(resultsRes.data ?? []).forEach((r: any) => {
    resultsCounts[r.teacher_id] = (resultsCounts[r.teacher_id] ?? 0) + 1
  })

  // FIX: Build subject/class sets AND per-class assignment details from class_teachers
  const subjectMap:    Record<string, Set<string>> = {}
  const classMap:      Record<string, Set<string>> = {}
  const assignmentMap: Record<string, { class_name: string; subject: string | null; is_primary: boolean }[]> = {}

  ;(ctRes.data ?? []).forEach((ct: any) => {
    const tid       = ct.teacher_id
    const className = ct.classes?.name ?? ''
    const subject   = ct.subject ?? null

    if (!subjectMap[tid])    subjectMap[tid]    = new Set()
    if (!classMap[tid])      classMap[tid]      = new Set()
    if (!assignmentMap[tid]) assignmentMap[tid] = []

    if (subject)   subjectMap[tid].add(subject)
    if (className) classMap[tid].add(className)

    assignmentMap[tid].push({
      class_name: className,
      subject,
      is_primary: ct.is_primary ?? false,
    })
  })

  // Sort assignments: class teachers first, then alphabetically
  Object.values(assignmentMap).forEach(arr => {
    arr.sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1
      if (!a.is_primary && b.is_primary) return 1
      return a.class_name.localeCompare(b.class_name)
    })
  })

  const rows: TeacherRow[] = (teachers ?? []).map((t: any) => ({
    id:                t.id,
    full_name:         t.full_name        ?? 'Unknown',
    email:             t.email            ?? '',
    phone:             t.phone            ?? null,
    employee_id:       t.employee_id      ?? null,
    qualification:     t.qualification    ?? null,
    is_active:         t.is_active !== false,
    subjects:          Array.from(subjectMap[t.id] ?? []),
    classes:           Array.from(classMap[t.id] ?? []),
    class_assignments: assignmentMap[t.id] ?? [],
    last_activity:     lastActivity[t.id]?.ts     ?? null,
    last_action:       lastActivity[t.id]?.action ?? null,
    notes_uploaded:    notesCounts[t.id]           ?? 0,
    results_posted:    resultsCounts[t.id]         ?? 0,
  }))

  return <TeachersClient teachers={rows} />
}
