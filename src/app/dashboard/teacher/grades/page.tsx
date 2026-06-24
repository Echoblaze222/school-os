// src/app/dashboard/teacher/grades/page.tsx
//
// FIXED — 5 bugs that caused the submissions pipeline to break:
//
// BUG 1 — Wrong join table for student name:
//   Was:  student_profiles!student_id(full_name, student_number)
//   Real table 'student_profiles' has NO full_name or student_number.
//   Fix:  profiles!student_id(full_name, student_number)
//
// BUG 2 — Non-existent column 'notes' on assignment_submissions:
//   Was:  notes  → always null, student's written answer was invisible to teacher
//   Fix:  text_response, answer_text (both exist; coalesce client-side)
//
// BUG 3 — Status filter was wrong (pending_count always 0):
//   Was:  s.status === 'pending'
//   Real submission_status enum: pending | submitted | graded | late
//   Students submit with status='submitted', not 'pending'. So every
//   submitted assignment was counted as graded, and the Pending tab
//   was always empty even when students had submitted.
//   Fix:  s.status !== 'graded'  (pending + submitted + late = needs grading)
//
// BUG 4 — Submission type declared wrong status values:
//   Was:  'pending' | 'graded' | 'returned'
//   Fix:  'pending' | 'submitted' | 'graded' | 'late'
//
// BUG 5 — Teacher scoping used only class_subjects.teacher_id:
//   class_subjects.teacher_id is nullable and may not be set for all rows.
//   The authoritative source is class_teachers junction table.
//   Fix: query class_teachers by teacher_id, derive class_ids, then find
//        class_subjects by class_id. Falls back to class_subjects.teacher_id
//        as a secondary path so either architecture works.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GradeSubmissionsClient from './GradeSubmissionsClient'

export interface Submission {
  id:               string
  student_id:       string
  student_name:     string
  student_number:   string | null
  assignment_id:    string
  assignment_title: string
  subject_name:     string
  class_name:       string
  class_subject_id: string
  submitted_at:     string
  file_url:         string | null
  // BUG 2 FIX: was 'notes' — column doesn't exist; real column is text_response
  text_response:    string | null
  score:            number | null
  max_score:        number
  feedback:         string | null
  // BUG 4 FIX: real submission_status enum values
  status:           'pending' | 'submitted' | 'graded' | 'late'
}

export interface AssignmentGroup {
  assignment_id:    string
  title:            string
  subject_name:     string
  class_name:       string
  class_subject_id: string
  due_date:         string | null
  max_score:        number
  pending_count:    number   // submissions that need grading (status != 'graded')
  graded_count:     number   // submissions already graded
}

export default async function GradeSubmissionsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  if (!profile || !['teacher', 'admin'].includes((profile as any).role)) {
    redirect('/dashboard/student')
  }

  // ── BUG 5 FIX: get teacher's class_ids from class_teachers (authoritative) ──
  const { data: classTeacherRows } = await supabase
    .from('class_teachers')
    .select('class_id')
    .eq('teacher_id', user.id)
    .eq('school_id', school?.id)

  const classIdsFromJunction = (classTeacherRows ?? []).map((r: any) => r.class_id)

  // ── Also get class_subjects directly assigned to this teacher ──
  // (supports both architectures — class_teachers junction AND
  //  direct class_subjects.teacher_id assignment)
  const { data: classSubjectsDirect } = await supabase
    .from('class_subjects')
    .select('id, class_id, subject_id, classes(name), subjects(name)')
    .eq('teacher_id', user.id)

  // Get class_subjects for classes from junction table
  let classSubjectsFromJunction: any[] = []
  if (classIdsFromJunction.length > 0) {
    const { data } = await supabase
      .from('class_subjects')
      .select('id, class_id, subject_id, classes(name), subjects(name)')
      .in('class_id', classIdsFromJunction)
    classSubjectsFromJunction = data ?? []
  }

  // Merge both, deduplicating by id
  const csById: Record<string, any> = {}
  ;[...(classSubjectsDirect ?? []), ...classSubjectsFromJunction].forEach(cs => {
    csById[cs.id] = cs
  })
  const classSubjects = Object.values(csById)

  // Build lookup map
  const csMap: Record<string, { subject: string; class: string }> = {}
  classSubjects.forEach((cs: any) => {
    csMap[cs.id] = {
      subject: cs.subjects?.name ?? 'Unknown',
      class:   cs.classes?.name ?? 'Unknown',
    }
  })

  const csIds = Object.keys(csMap)

  if (csIds.length === 0) {
    return (
      <GradeSubmissionsClient
        submissions={[]}
        assignmentGroups={[]}
        teacherId={user.id}
        profile={profile}
        school={school}
      />
    )
  }

  // ── Fetch assignments for this teacher's class_subjects ──
  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, title, class_subject_id, due_date, max_score')
    .in('class_subject_id', csIds)
    .eq('status', 'active')
    .order('due_date', { ascending: false })

  const assignmentIds = (assignments ?? []).map((a: any) => a.id)
  const assignmentMap: Record<string, any> = {}
  ;(assignments ?? []).forEach((a: any) => { assignmentMap[a.id] = a })

  // ── Fetch submissions ──
  let submissions: Submission[] = []
  if (assignmentIds.length > 0) {
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select(`
        id, student_id, assignment_id,
        submitted_at, file_url,
        text_response, answer_text,
        score, feedback, status,
        student:profiles!student_id (
          full_name,
          student_number
        )
      `)
      .in('assignment_id', assignmentIds)
      // Only show actual submissions (status != 'pending' draft rows)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })

    // BUG 1 FIX: join is profiles!student_id (not student_profiles)
    // BUG 2 FIX: map text_response (not notes)
    submissions = (subs ?? []).map((s: any) => {
      const asgn   = assignmentMap[s.assignment_id]
      const csInfo = csMap[asgn?.class_subject_id] ?? { subject: 'Unknown', class: 'Unknown' }
      const student = s.student ?? {}
      return {
        id:               s.id,
        student_id:       s.student_id,
        student_name:     student.full_name ?? 'Unknown Student',
        student_number:   student.student_number ?? null,
        assignment_id:    s.assignment_id,
        assignment_title: asgn?.title ?? 'Unknown Assignment',
        subject_name:     csInfo.subject,
        class_name:       csInfo.class,
        class_subject_id: asgn?.class_subject_id ?? '',
        submitted_at:     s.submitted_at,
        file_url:         s.file_url ?? null,
        // BUG 2 FIX: text_response is the student's written answer (was wrongly 'notes')
        text_response:    s.text_response ?? s.answer_text ?? null,
        score:            s.score ?? null,
        max_score:        asgn?.max_score ?? 100,
        feedback:         s.feedback ?? null,
        status:           s.status ?? 'submitted',
      }
    })
  }

  // ── Build assignment groups ──
  const groupMap: Record<string, AssignmentGroup> = {}
  ;(assignments ?? []).forEach((a: any) => {
    const csInfo = csMap[a.class_subject_id] ?? { subject: 'Unknown', class: 'Unknown' }
    groupMap[a.id] = {
      assignment_id:    a.id,
      title:            a.title,
      subject_name:     csInfo.subject,
      class_name:       csInfo.class,
      class_subject_id: a.class_subject_id,
      due_date:         a.due_date ?? null,
      max_score:        a.max_score ?? 100,
      pending_count:    0,
      graded_count:     0,
    }
  })

  submissions.forEach(s => {
    if (!groupMap[s.assignment_id]) return
    // BUG 3 FIX: 'pending' means needs grading = status is NOT 'graded'
    // Students submit with status='submitted', not 'pending'
    if (s.status !== 'graded') {
      groupMap[s.assignment_id].pending_count++
    } else {
      groupMap[s.assignment_id].graded_count++
    }
  })

  const assignmentGroups = Object.values(groupMap)
    .filter(g => g.pending_count + g.graded_count > 0) // only show assignments that have submissions
    .sort((a, b) => b.pending_count - a.pending_count)

  return (
    <GradeSubmissionsClient
      submissions={submissions}
      assignmentGroups={assignmentGroups}
      teacherId={user.id}
      profile={profile}
      school={school}
    />
  )
}
