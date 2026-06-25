// src/app/dashboard/teacher/results/page.tsx
// Feeds PostResultsClient with:
//   - teacherClasses: class_subjects rows this teacher owns
//   - allStudents:    every student in those classes (for score entry)
//   - existingResults: already-posted results for pre-filling scores
//   - schoolId + academicYear: needed for correct insert payload

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import PostResultsClient from './PostResultsClient'

export default async function TeacherResultsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 1) Teacher's profile + school
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'teacher') redirect('/login')

  const school   = (profile as any).schools ?? null
  const schoolId = school?.id ?? ''

  // 2) Classes this teacher is assigned to (via class_subjects)
  //    Join subjects + classes so we get display names
  const { data: classSubjects } = await supabase
    .from('class_subjects')
    .select(`
      id,
      class_id,
      subject_id,
      teacher_id,
      subjects ( id, name, code ),
      classes  ( id, name, class_level )
    `)
    .eq('teacher_id', user.id)
    .eq('school_id',  schoolId)

  const teacherClasses = (classSubjects ?? []).map((cs: any) => ({
    class_subject_id: cs.id,
    class_id:         cs.class_id,
    subject_id:       cs.subject_id,
    subject_name:     cs.subjects?.name    ?? '—',
    class_name:       cs.classes?.name     ?? cs.classes?.class_level ?? '—',
  }))

  // 3) All students in those classes
  //    We look up profiles with role='student' + class_id in our set
  const classIds = [...new Set(teacherClasses.map((tc: any) => tc.class_id))]

  let allStudents: any[] = []
  if (classIds.length > 0) {
    const { data: students } = await supabase
      .from('profiles')
      .select('id, full_name, student_number, admission_number, class_id')
      .eq('school_id', schoolId)
      .eq('role', 'student')
      .in('class_id', classIds)
      .order('full_name')

    allStudents = (students ?? []).map(s => ({
      student_id:     s.id,
      full_name:      s.full_name,
      student_number: s.student_number ?? s.admission_number ?? null,
      class_id:       s.class_id,
    }))
  }

  // 4) Existing results for ALL of this teacher's class_subjects
  //    Used to pre-fill score inputs on step 3
  const classSubjectIds = teacherClasses.map((tc: any) => tc.class_subject_id)

  let existingResults: any[] = []
  if (classSubjectIds.length > 0) {
    const { data: existing } = await supabase
      .from('results')
      .select('id, student_id, class_subject_id, result_type, term, score, max_score, grade, approved')
      .eq('school_id', schoolId)
      .in('class_subject_id', classSubjectIds)

    existingResults = existing ?? []
  }

  // 5) Academic year from school settings if available, else compute
  //    Many schemas store this in school_settings; fall back gracefully.
  let academicYear: string | undefined
  try {
    const { data: settings } = await supabase
      .from('school_settings')
      .select('current_academic_year')
      .eq('school_id', schoolId)
      .maybeSingle()
    academicYear = (settings as any)?.current_academic_year ?? undefined
  } catch {
    // table may not exist — PostResultsClient has its own fallback
  }

  return (
    <PostResultsClient
      teacherClasses={teacherClasses}
      allStudents={allStudents}
      existingResults={existingResults}
      teacherId={user.id}
      teacherName={profile.full_name}
      schoolId={schoolId}
      academicYear={academicYear}
    />
  )
      }
      
