// src/app/dashboard/teacher/assignments/[id]/submissions/page.tsx
// Server Component — loads one assignment and all its student submissions

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubmissionsClient from './SubmissionsClient'

export interface AssignmentMeta {
  id: string
  title: string
  description: string | null
  subject_name: string
  class_name: string
  class_subject_id: string
  due_date: string | null
  max_score: number
  total_students: number
}

export interface SubmissionRow {
  id: string                               // submission id (or synthetic for pending)
  student_id: string
  student_name: string
  student_number: string | null
  submitted_at: string | null
  file_url: string | null
  notes: string | null
  score: number | null
  feedback: string | null
  status: 'submitted' | 'late' | 'pending' | 'graded'
  is_late: boolean
}

export default async function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase =await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['teacher', 'admin'].includes(profile.role)) redirect('/dashboard/student')

  // Load assignment
  const { data: assignment } = await supabase
    .from('assignments')
    .select(`
      id, title, description, due_date, max_score, class_subject_id,
      class_subjects (
        teacher_id,
        subjects ( name ),
        classes ( name )
      )
    `)
    .eq('id', id)
    .single()

  if (!assignment) redirect('/dashboard/teacher')

  // Verify ownership
  const cs = (assignment as any).class_subjects
  if (cs?.teacher_id !== user.id && profile.role !== 'admin') redirect('/dashboard/teacher')

  const meta: AssignmentMeta = {
    id: (assignment as any).id,
    title: (assignment as any).title,
    description: (assignment as any).description ?? null,
    subject_name: cs?.subjects?.name ?? 'Unknown',
    class_name: cs?.classes?.name ?? 'Unknown',
    class_subject_id: (assignment as any).class_subject_id,
    due_date: (assignment as any).due_date ?? null,
    max_score: (assignment as any).max_score ?? 100,
    total_students: 0, // set below
  }

  // All students in this class
  const { data: classInfo } = await supabase
    .from('class_subjects')
    .select('class_id')
    .eq('id', meta.class_subject_id)
    .single()

  const classId = (classInfo as any)?.class_id

  const { data: allStudents } = await supabase
    .from('student_profiles')
    .select('id, full_name, student_number')
    .eq('class_id', classId)
    .order('full_name')

  meta.total_students = (allStudents ?? []).length

  // Existing submissions
  const { data: subs } = await supabase
    .from('assignment_submissions')
    .select('id, student_id, submitted_at, file_url, notes, score, feedback, status')
    .eq('assignment_id', id)

  const subMap: Record<string, any> = {}
  ;(subs ?? []).forEach((s: any) => { subMap[s.student_id] = s })

  const dueMs = meta.due_date ? new Date(meta.due_date).getTime() : Infinity

  const rows: SubmissionRow[] = (allStudents ?? []).map((s: any) => {
    const sub = subMap[s.id]
    if (sub) {
      const submittedMs = sub.submitted_at ? new Date(sub.submitted_at).getTime() : 0
      const isLate = submittedMs > dueMs
      return {
        id: sub.id,
        student_id: s.id,
        student_name: s.full_name ?? 'Unknown',
        student_number: s.student_number ?? null,
        submitted_at: sub.submitted_at,
        file_url: sub.file_url ?? null,
        notes: sub.notes ?? null,
        score: sub.score ?? null,
        feedback: sub.feedback ?? null,
        status: sub.status === 'graded' ? 'graded' : isLate ? 'late' : 'submitted',
        is_late: isLate,
      }
    }
    return {
      id: `pending-${s.id}`,
      student_id: s.id,
      student_name: s.full_name ?? 'Unknown',
      student_number: s.student_number ?? null,
      submitted_at: null,
      file_url: null,
      notes: null,
      score: null,
      feedback: null,
      status: 'pending',
      is_late: false,
    }
  })

  return (
    <SubmissionsClient
      assignment={meta}
      submissions={rows}
      teacherId={user.id}
    />
  )
}
