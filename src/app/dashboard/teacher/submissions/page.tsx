// src/app/dashboard/teacher/submissions/page.tsx
// FIXED:
// 1. Supabase PostgREST cannot filter on joined tables with .eq('joined_table.column', value)
//    — replaced with two sequential queries: fetch teacher's assignment IDs first,
//      then fetch submissions filtered by those IDs
// 2. Added school_id to the data flow so SubmissionsClient can use school branding

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubmissionsClient from './SubmissionsClient'

export const metadata = { title: 'Grade Submissions — SchoolOS' }

export interface Submission {
  id: string
  student_id: string
  student_name: string
  student_avatar: string | null
  assignment_id: string
  assignment_title: string
  class_name: string
  subject: string
  max_score: number
  submitted_at: string
  file_url: string | null
  file_name: string | null
  score: number | null
  feedback: string | null
  graded_at: string | null
  status: string
}

export default async function SubmissionsPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // Get profile + school for branding
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()
  const school = (profile as any)?.schools ?? null

  // FIXED: two-step query — Supabase PostgREST doesn't support filtering
  // on joined tables via .eq('assignments.teacher_id', ...)

  // Step 1: get this teacher's assignment IDs
  const { data: myAssignments } = await supabase
    .from('assignments')
    .select('id, title, max_score, subject, class_id, classes(name)')
    .eq('teacher_id', user.id)

  const assignmentIds = (myAssignments ?? []).map((a: any) => a.id)

  // Step 2: fetch submissions for those assignments
  let submissions: Submission[] = []
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .select('id, student_id, assignment_id, submitted_at, file_url, file_name, score, feedback, graded_at, status, profiles!student_id(full_name, avatar_url)')
      .in('assignment_id', assignmentIds)
      .order('submitted_at', { ascending: false })

    if (error) console.error('[submissions]', error.message)

    const assignmentMap = Object.fromEntries(
      (myAssignments ?? []).map((a: any) => [a.id, a])
    )

    submissions = (data ?? []).map((r: any) => {
      const assignment = assignmentMap[r.assignment_id] ?? {}
      return {
        id: r.id,
        student_id: r.student_id,
        student_name: r.profiles?.full_name ?? 'Student',
        student_avatar: r.profiles?.avatar_url ?? null,
        assignment_id: r.assignment_id,
        assignment_title: assignment.title ?? '—',
        class_name: assignment.classes?.name ?? '—',
        subject: assignment.subject ?? '—',
        max_score: assignment.max_score ?? 100,
        submitted_at: r.submitted_at,
        file_url: r.file_url ?? null,
        file_name: r.file_name ?? null,
        score: r.score ?? null,
        feedback: r.feedback ?? null,
        graded_at: r.graded_at ?? null,
        status: r.status ?? 'submitted',
      }
    })
  }

  return (
    <SubmissionsClient
      submissions={submissions}
      graderId={user.id}
      school={school}
      profile={profile}
    />
  )
}
