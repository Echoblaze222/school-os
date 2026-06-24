// src/app/dashboard/teacher/submissions/page.tsx
//
// FIXED — the core pipeline bug:
// The old page was either missing or had a broken Supabase query that couldn't
// join assignment_submissions back to profiles + assignments + classes in one
// call, so the teacher's page received empty or null data even when students
// had successfully submitted.
//
// Correct join path (confirmed against schema):
//   assignment_submissions
//     → student:profiles!student_id        (student_id FK → profiles.id)
//     → assignment:assignments!assignment_id (assignment_id FK → assignments.id)
//         → class:classes!class_id         (assignments.class_id FK → classes.id)
//
// Filters to only THIS teacher's assignments:
//   assignments.teacher_id = user.id   (or assignments.created_by = user.id)
//   + assignments.school_id  = school.id  (multi-tenant guard)
//
// The `Submission` type is exported so SubmissionsClient can import it.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubmissionsClient from './SubmissionsClient'

export interface Submission {
  id:               string
  status:           string
  score:            number | null
  feedback:         string | null
  submitted_at:     string
  graded_at:        string | null
  file_url:         string | null
  file_name:        string | null
  text_response:    string | null
  max_score:        number
  // Joined fields — shaped in the map below
  student_name:     string
  student_avatar:   string | null
  assignment_title: string
  subject:          string
  class_name:       string
}

export default async function SubmissionsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  // ── Fetch all submissions for assignments belonging to THIS teacher ──
  // Supabase join syntax: table!foreign_key(columns)
  // assignment_submissions has no school_id — we filter via the nested
  // assignment.school_id instead.
  const { data: raw, error } = await supabase
    .from('assignment_submissions')
    .select(`
      id,
      status,
      score,
      feedback,
      submitted_at,
      graded_at,
      file_url,
      text_response,
      answer_text,
      student:profiles!student_id (
        id,
        full_name,
        avatar_url
      ),
      assignment:assignments!assignment_id (
        id,
        title,
        subject,
        max_score,
        school_id,
        teacher_id,
        created_by,
        class:classes!class_id (
          id,
          name,
          class_level,
          section
        )
      )
    `)
    .not('submitted_at', 'is', null)          // only actual submissions, not pending shells
    .order('submitted_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[teacher/submissions] fetch error:', error.message)
  }

  // Filter to only this teacher's assignments (can't do this in .eq() on nested)
  const teacherRows = (raw ?? []).filter((row: any) => {
    const asg = row.assignment
    if (!asg) return false
    if (asg.school_id !== school?.id) return false
    // Accept if teacher is the creator or the assigned teacher
    return asg.teacher_id === user.id || asg.created_by === user.id
  })

  // Shape into the Submission type SubmissionsClient expects
  const submissions: Submission[] = teacherRows.map((row: any) => {
    const asg   = row.assignment ?? {}
    const cls   = asg.class ?? {}
    const stud  = row.student ?? {}

    // Derive class display name
    const className = cls.name
      ?? (cls.class_level && cls.section ? `${cls.class_level} ${cls.section}` : 'Unknown class')

    // Derive file name from URL (last segment)
    let fileName: string | null = null
    if (row.file_url) {
      const parts = row.file_url.split('/')
      fileName = decodeURIComponent(parts[parts.length - 1]) || 'Submission file'
    }

    return {
      id:               row.id,
      status:           row.status ?? 'submitted',
      score:            row.score ?? null,
      feedback:         row.feedback ?? null,
      submitted_at:     row.submitted_at,
      graded_at:        row.graded_at ?? null,
      file_url:         row.file_url ?? null,
      file_name:        fileName,
      text_response:    row.text_response ?? row.answer_text ?? null,
      max_score:        asg.max_score ?? 100,
      student_name:     stud.full_name ?? 'Unknown student',
      student_avatar:   stud.avatar_url ?? null,
      assignment_title: asg.title ?? 'Assignment',
      subject:          asg.subject ?? '—',
      class_name:       className,
    }
  })

  return (
    <SubmissionsClient
      submissions={submissions}
      graderId={user.id}
      school={school}
      profile={profile}
    />
  )
}
