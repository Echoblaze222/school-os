// src/app/dashboard/teacher/grades/page.tsx
//
// DEFINITIVE FIX — avoids all 5 failure modes:
//
// 1. No longer depends on class_subjects.teacher_id (always null)
// 2. Uses TWO separate queries instead of .or() — PostgREST .or() with
//    multiple uuid columns can silently fail if any column has a FK
//    constraint that causes a planner issue. Two queries + JS merge is safer.
// 3. Falls back across posted_by → teacher_id → created_by so old rows
//    (created before teacher_id was added to the insert) are still found.
// 4. Logs every query result to server console so you can see in Vercel
//    logs exactly where the chain breaks if still empty.

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
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  if (!profile || !['teacher', 'admin'].includes((profile as any).role)) {
    redirect('/dashboard/student')
  }

  // ── 1. Fetch assignments — three separate queries, merge by id ──────────
  // Why separate instead of .or(): PostgREST .or() across FK-constrained
  // uuid columns can silently return 0 rows in some Supabase versions.
  // Three queries + JS Set merge is explicit and debuggable.

  const selectCols = `
    id, title, class_subject_id, class_id,
    due_date, max_score, subject, posted_by,
    teacher_id, created_by,
    classes(name)
  `

  const [byPostedBy, byTeacherId, byCreatedBy] = await Promise.all([
    supabase.from('assignments').select(selectCols)
      .eq('school_id', school?.id).eq('posted_by',   user.id),
    supabase.from('assignments').select(selectCols)
      .eq('school_id', school?.id).eq('teacher_id',  user.id),
    supabase.from('assignments').select(selectCols)
      .eq('school_id', school?.id).eq('created_by',  user.id),
  ])

  // Vercel server log — will show in your Vercel dashboard → Functions → logs
  console.log('[grades] posted_by rows:', byPostedBy.data?.length ?? 0, byPostedBy.error?.message ?? 'ok')
  console.log('[grades] teacher_id rows:', byTeacherId.data?.length ?? 0, byTeacherId.error?.message ?? 'ok')
  console.log('[grades] created_by rows:', byCreatedBy.data?.length ?? 0, byCreatedBy.error?.message ?? 'ok')

  // Merge, deduplicate by id
  const asgMap: Record<string, any> = {}
  for (const row of [
    ...(byPostedBy.data  ?? []),
    ...(byTeacherId.data ?? []),
    ...(byCreatedBy.data ?? []),
  ]) {
    asgMap[row.id] = row
  }
  const allAssignments = Object.values(asgMap)
  const assignmentIds  = allAssignments.map((a: any) => a.id)

  console.log('[grades] total unique assignments:', allAssignments.length)

  // ── 2. Enrich with class_subjects display names (best-effort) ────────────
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

  function getNames(a: any) {
    if (a.class_subject_id && csMap[a.class_subject_id]) return csMap[a.class_subject_id]
    return {
      subject: a.subject       ?? 'Unknown subject',
      class:   a.classes?.name ?? 'Unknown class',
    }
  }

  // ── 3. Fetch submissions ─────────────────────────────────────────────────
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

    console.log('[grades] submissions:', subs?.length ?? 0, subErr?.message ?? 'ok')

    submissions = (subs ?? []).map((s: any) => {
      const asgn  = asgMap[s.assignment_id]
      const names = asgn ? getNames(asgn) : { subject: 'Unknown', class: 'Unknown' }
      const stud  = s.student ?? {}
      return {
        id:               s.id,
        student_id:       s.student_id,
        student_name:     stud.full_name      ?? 'Unknown Student',
        student_number:   stud.student_number ?? null,
        assignment_id:    s.assignment_id,
        assignment_title: asgn?.title         ?? 'Assignment',
        subject_name:     names.subject,
        class_name:       names.class,
        class_subject_id: asgn?.class_subject_id ?? '',
        submitted_at:     s.submitted_at,
        file_url:         s.file_url          ?? null,
        text_response:    s.text_response ?? s.answer_text ?? null,
        score:            s.score             ?? null,
        max_score:        asgn?.max_score     ?? 100,
        feedback:         s.feedback          ?? null,
        status:           s.status            ?? 'submitted',
      }
    })
  }

  // ── 4. Build assignment groups ───────────────────────────────────────────
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

  const assignmentGroups = Object.values(groupMap)
    .filter(g => g.pending_count + g.graded_count > 0)
    .sort((a, b) => b.pending_count - a.pending_count)

  console.log('[grades] assignmentGroups with submissions:', assignmentGroups.length)

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
      
