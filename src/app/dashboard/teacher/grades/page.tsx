// src/app/dashboard/teacher/grades/page.tsx
//
// ROOT CAUSE FIX (this session):
//
// The page was fetching assignments via class_subject_id chain:
//   class_teachers → class_ids → class_subjects → csIds → assignments
//
// This broke because:
//   1. class_subjects rows may not exist for every class (table is sparsely populated)
//   2. Even when they do, assignments created with class_subject_id = null
//      (when no class_subjects row matched) are invisible to the .in() filter
//
// The dashboard home page showed "1 TO GRADE" correctly because it queries
// assignments directly via teacher_id. The grades page used a longer chain
// that could silently return 0 results at any step.
//
// FIX: Query assignments directly by teacher_id/created_by/posted_by.
// This is authoritative — we now always write teacher_id on insert.
// class_subjects is still used to enrich subject/class display names,
// but it no longer gates which assignments appear.

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
  text_response:    string | null
  score:            number | null
  max_score:        number
  feedback:         string | null
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
  pending_count:    number
  graded_count:     number
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

  // ── STEP 1: Fetch assignments owned by this teacher directly ──
  // Use teacher_id OR created_by OR posted_by — all three were written
  // on insert in teacher-AssignmentsClient.tsx. This query bypasses the
  // class_subjects chain that was causing the empty page.
  const { data: assignments, error: asgErr } = await supabase
    .from('assignments')
    .select(`
      id, title, class_subject_id, class_id,
      due_date, max_score, subject, status,
      classes(name)
    `)
    .eq('school_id', school?.id)
    .or(`teacher_id.eq.${user.id},created_by.eq.${user.id},posted_by.eq.${user.id}`)
    .order('due_date', { ascending: false })

  if (asgErr) {
    console.error('[grades] assignments fetch error:', asgErr.message)
  }

  const allAssignments = assignments ?? []
  const assignmentIds  = allAssignments.map((a: any) => a.id)
  const assignmentMap: Record<string, any> = {}
  allAssignments.forEach((a: any) => { assignmentMap[a.id] = a })

  // ── STEP 2: Enrich with class_subjects for subject display names ──
  // (best-effort — doesn't gate which assignments show)
  const csIds = [...new Set(
    allAssignments
      .map((a: any) => a.class_subject_id)
      .filter(Boolean)
  )] as string[]

  const csMap: Record<string, { subject: string; class: string }> = {}

  if (csIds.length > 0) {
    const { data: csList } = await supabase
      .from('class_subjects')
      .select('id, subjects(name), classes(name)')
      .in('id', csIds)

    ;(csList ?? []).forEach((cs: any) => {
      csMap[cs.id] = {
        subject: cs.subjects?.name ?? 'Unknown',
        class:   cs.classes?.name  ?? 'Unknown',
      }
    })
  }

  // Helper: get display names from all available sources in priority order
  function getNames(a: any) {
    // Priority 1: class_subjects join
    if (a.class_subject_id && csMap[a.class_subject_id]) {
      return csMap[a.class_subject_id]
    }
    // Priority 2: directly stored columns (subject text, classes(name) join)
    return {
      subject: a.subject ?? 'Unknown subject',
      class:   a.classes?.name ?? 'Unknown class',
    }
  }

  // ── STEP 3: Fetch submissions for all these assignments ──
  let submissions: Submission[] = []

  if (assignmentIds.length > 0) {
    const { data: subs, error: subErr } = await supabase
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
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })

    if (subErr) {
      console.error('[grades] submissions fetch error:', subErr.message)
    }

    submissions = (subs ?? []).map((s: any) => {
      const asgn   = assignmentMap[s.assignment_id]
      const names  = asgn ? getNames(asgn) : { subject: 'Unknown', class: 'Unknown' }
      const student = s.student ?? {}
      return {
        id:               s.id,
        student_id:       s.student_id,
        student_name:     student.full_name    ?? 'Unknown Student',
        student_number:   student.student_number ?? null,
        assignment_id:    s.assignment_id,
        assignment_title: asgn?.title          ?? 'Assignment',
        subject_name:     names.subject,
        class_name:       names.class,
        class_subject_id: asgn?.class_subject_id ?? '',
        submitted_at:     s.submitted_at,
        file_url:         s.file_url           ?? null,
        text_response:    s.text_response ?? s.answer_text ?? null,
        score:            s.score              ?? null,
        max_score:        asgn?.max_score      ?? 100,
        feedback:         s.feedback           ?? null,
        status:           s.status             ?? 'submitted',
      }
    })
  }

  // ── STEP 4: Build assignment groups (only ones with submissions) ──
  const groupMap: Record<string, AssignmentGroup> = {}

  allAssignments.forEach((a: any) => {
    const names = getNames(a)
    groupMap[a.id] = {
      assignment_id:    a.id,
      title:            a.title,
      subject_name:     names.subject,
      class_name:       names.class,
      class_subject_id: a.class_subject_id ?? '',
      due_date:         a.due_date         ?? null,
      max_score:        a.max_score        ?? 100,
      pending_count:    0,
      graded_count:     0,
    }
  })

  submissions.forEach(s => {
    if (!groupMap[s.assignment_id]) return
    if (s.status !== 'graded') {
      groupMap[s.assignment_id].pending_count++
    } else {
      groupMap[s.assignment_id].graded_count++
    }
  })

  const assignmentGroups = Object.values(groupMap)
    .filter(g => g.pending_count + g.graded_count > 0)
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
