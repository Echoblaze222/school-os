// src/app/dashboard/teacher/submissions/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import SubmissionsClient, { type Submission } from './SubmissionsClient'

export const metadata = { title: 'Grade Submissions — SchoolOS' }

export default async function SubmissionsPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // ── Step 1: get the IDs of assignments belonging to this teacher ──────────
  // Supabase does NOT support .eq('joined_table.column', value) on PostgREST
  // filters. We have to filter in two steps.
  const { data: myAssignments } = await supabase
    .from('assignments')
    .select('id')
    .eq('teacher_id', user.id)

  const assignmentIds = (myAssignments ?? []).map((a: any) => a.id)

  if (!assignmentIds.length) {
    return <SubmissionsClient submissions={[]} graderId={user.id} />
  }

  // ── Step 2: fetch submissions for those assignments ───────────────────────
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select(`
      id, student_id, assignment_id, submitted_at,
      file_url, file_name, answer_text,
      score, feedback, graded_at, status,
      profiles!student_id ( full_name, avatar_url ),
      assignments ( title, max_score, subject, classes ( name ) )
    `)
    .in('assignment_id', assignmentIds)
    .order('submitted_at', { ascending: false })

  if (error) console.error('[submissions]', error.message)

  const submissions: Submission[] = (data ?? []).map((r: any) => ({
    id:               r.id,
    student_id:       r.student_id,
    student_name:     r.profiles?.full_name    ?? 'Student',
    student_avatar:   r.profiles?.avatar_url   ?? null,
    assignment_id:    r.assignment_id,
    assignment_title: r.assignments?.title      ?? '—',
    class_name:       r.assignments?.classes?.name ?? '—',
    subject:          r.assignments?.subject    ?? '—',
    max_score:        r.assignments?.max_score  ?? 100,
    submitted_at:     r.submitted_at,
    file_url:         r.file_url    ?? null,
    file_name:        r.file_name   ?? null,
    answer_text:      r.answer_text ?? null,   // ← pass student's written answer
    score:            r.score       ?? null,
    feedback:         r.feedback    ?? null,
    graded_at:        r.graded_at   ?? null,
    status:           r.status      ?? 'submitted',
  }))

  return <SubmissionsClient submissions={submissions} graderId={user.id} />
}
