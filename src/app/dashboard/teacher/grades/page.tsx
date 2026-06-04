// src/app/dashboard/teacher/grades/page.tsx
// FIX #7: Now passes profile + school to GradeSubmissionsClient for RolePageWrapper

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GradeSubmissionsClient from './GradeSubmissionsClient'

export interface Submission {
  id: string
  student_id: string
  student_name: string
  student_number: string | null
  assignment_id: string
  assignment_title: string
  subject_name: string
  class_name: string
  class_subject_id: string
  submitted_at: string
  file_url: string | null
  notes: string | null
  score: number | null
  max_score: number
  feedback: string | null
  status: 'pending' | 'graded' | 'returned'
}

export interface AssignmentGroup {
  assignment_id: string
  title: string
  subject_name: string
  class_name: string
  class_subject_id: string
  due_date: string | null
  max_score: number
  pending_count: number
  graded_count: number
}

export default async function GradeSubmissionsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  // FIX #7: Fetch full profile + school (needed by RolePageWrapper)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  if (!profile || !['teacher', 'admin'].includes((profile as any).role)) {
    redirect('/dashboard/student')
  }

  // Assignments scoped to this teacher's class_subjects
  const { data: classSubjects } = await supabase
    .from('class_subjects')
    .select('id, class_id, subject_id, classes(name), subjects(name)')
    .eq('teacher_id', user.id)

  const csIds = (classSubjects ?? []).map((cs: any) => cs.id)
  const csMap: Record<string, { subject: string; class: string }> = {}
  ;(classSubjects ?? []).forEach((cs: any) => {
    csMap[cs.id] = {
      subject: cs.subjects?.name ?? 'Unknown',
      class:   cs.classes?.name ?? 'Unknown',
    }
  })

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

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, title, class_subject_id, due_date, max_score')
    .in('class_subject_id', csIds)
    .order('due_date', { ascending: false })

  const assignmentIds = (assignments ?? []).map((a: any) => a.id)
  const assignmentMap: Record<string, any> = {}
  ;(assignments ?? []).forEach((a: any) => { assignmentMap[a.id] = a })

  let submissions: Submission[] = []
  if (assignmentIds.length > 0) {
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select(`
        id, student_id, assignment_id,
        submitted_at, file_url, notes,
        score, feedback, status,
        student_profiles ( full_name, student_number )
      `)
      .in('assignment_id', assignmentIds)
      .order('submitted_at', { ascending: false })

    submissions = (subs ?? []).map((s: any) => {
      const asgn   = assignmentMap[s.assignment_id]
      const csInfo = csMap[asgn?.class_subject_id] ?? { subject: 'Unknown', class: 'Unknown' }
      return {
        id:               s.id,
        student_id:       s.student_id,
        student_name:     s.student_profiles?.full_name ?? 'Unknown',
        student_number:   s.student_profiles?.student_number ?? null,
        assignment_id:    s.assignment_id,
        assignment_title: asgn?.title ?? 'Unknown Assignment',
        subject_name:     csInfo.subject,
        class_name:       csInfo.class,
        class_subject_id: asgn?.class_subject_id ?? '',
        submitted_at:     s.submitted_at,
        file_url:         s.file_url ?? null,
        notes:            s.notes ?? null,
        score:            s.score ?? null,
        max_score:        asgn?.max_score ?? 100,
        feedback:         s.feedback ?? null,
        status:           s.status ?? 'pending',
      }
    })
  }

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
    if (groupMap[s.assignment_id]) {
      if (s.status === 'pending') groupMap[s.assignment_id].pending_count++
      else                        groupMap[s.assignment_id].graded_count++
    }
  })

  const assignmentGroups = Object.values(groupMap)
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
