// src/app/dashboard/teacher/submissions/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubmissionsClient from './SubmissionsClient'

export const metadata = { title: 'Grade Submissions — SchoolOS' }

export interface Submission {
  id: string; student_id: string; student_name: string; student_avatar: string | null
  assignment_id: string; assignment_title: string; class_name: string; subject: string
  max_score: number; submitted_at: string; file_url: string | null; file_name: string | null
  score: number | null; feedback: string | null; graded_at: string | null; status: string
}

export default async function SubmissionsPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data, error } = await supabase
    .from('assignment_submissions')
    .select(`
      id, student_id, submitted_at, file_url, file_name, score, feedback, graded_at, status,
      student_profiles(full_name, avatar_url),
      assignments!inner(title, max_score, teacher_id, subject, classes(name))
    `)
    .eq('assignments.teacher_id', user.id)
    .order('submitted_at', { ascending: false })

  if (error) console.error('[submissions]', error.message)

  const submissions: Submission[] = (data ?? []).map((r: any) => ({
    id: r.id, student_id: r.student_id,
    student_name: r.student_profiles?.full_name ?? 'Student',
    student_avatar: r.student_profiles?.avatar_url ?? null,
    assignment_id: r.assignment_id,
    assignment_title: r.assignments?.title ?? '—',
    class_name: r.assignments?.classes?.name ?? '—',
    subject: r.assignments?.subject ?? '—',
    max_score: r.assignments?.max_score ?? 100,
    submitted_at: r.submitted_at, file_url: r.file_url ?? null, file_name: r.file_name ?? null,
    score: r.score ?? null, feedback: r.feedback ?? null, graded_at: r.graded_at ?? null, status: r.status ?? 'submitted',
  }))

  return <SubmissionsClient submissions={submissions} graderId={user.id} />
}
