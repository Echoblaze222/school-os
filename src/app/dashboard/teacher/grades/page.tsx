// src/app/dashboard/teacher/grades/page.tsx
//
// ROOT CAUSE: The old code had a hard early-return at line 72:
//   if (csIds.length === 0) return <empty />
//
// class_subjects.teacher_id is NEVER populated automatically — it requires
// a separate admin action. For Pius's school (Kings College), it's null on
// all rows. So csIds was always [], hitting the early return every time.
//
// THE FIX: Query assignments directly by teacher_id/created_by/posted_by.
// All three are now written on insert (teacher-AssignmentsClient.tsx fix).
// class_subjects is used only for display name enrichment — never to gate
// which assignments appear.

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

  // ── 1. Fetch assignments owned by this teacher directly ──────────────────
  // DO NOT go via class_subjects — that table's teacher_id column is null
  // for most schools and is never auto-populated.
  // teacher_id, created_by, posted_by are all written on insert now.
  const { data: assignments, error: asgErr } = await supabase
    .from('assignments')
    .select(`
      id, title, class_subject_id, class_id,
      due_date, max_score, subject,
      classes(name)
    `)
    .eq('school_id', school?.id)
    .or(`teacher_id.eq.${user!.id},created_by.eq.${user!.id},posted_by.eq.${user!.id}`)
    .order('due_date', { ascending: false })

  if (asgErr) console.error('[grades] assignments error:', asgErr.message)

  const allAssignments = assignments ?? []
  const assignmentIds  = allAssignments.map((a: any) => a.id)
  const assignmentMap: Record<string, any> = {}
  allAssignments.forEach((a: any) => { assignmentMap[a.id] = a })

  // ── 2. Enrich display names from class_subjects (best-effort) ────────────
  const csIds = [...new Set(
    allAssignments.map((a: any) => a.class_subject_id).filter(Boolean)
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

  function getNames(a: any): { subject: string; class: string } {
    if (a.class_subject_id && csMap[a.class_subject_id]) {
      return csMap[a.class_subject_id]
    }
    return {
      subject: a.subject        ?? 'Unknown subject',
      class:   a.classes?.name  ?? 'Unknown class',
    }
  }

  // ── 3. Fetch submissions for all this teacher's assignments ──────────────
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

    if (subErr) console.error('[grades] submissions error:', subErr.message)

    submissions = (subs ?? []).map((s: any) => {
      const asgn  = assignmentMap[s.assignment_id]
      const names = asgn ? getNames(asgn) : { subject: 'Unknown', class: 'Unknown' }
      const stud  = s.student ?? {}
      return {
        id:               s.id,
        student_id:       s.student_id,
        student_name:     stud.full_name       ?? 'Unknown Student',
        student_number:   stud.student_number  ?? null,
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

  // ── 4. Group by assignment, count pending vs graded ──────────────────────
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
    if (s.status !== 'graded') groupMap[s.assignment_id].pending_count++
    else                       groupMap[s.assignment_id].graded_count++
  })

  // Only show assignments that have at least one submission
  const assignmentGroups = Object.values(groupMap)
    .filter(g => g.pending_count + g.graded_count > 0)
    .sort((a, b) => b.pending_count - a.pending_count)

  return (
    <GradeSubmissionsClient
      submissions={submissions}
      assignmentGroups={assignmentGroups}
      teacherId={user!.id}
      profile={profile}
      school={school}
    />
  )
    }
      
