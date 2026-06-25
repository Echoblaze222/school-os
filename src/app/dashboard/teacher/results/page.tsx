// src/app/dashboard/teacher/results/page.tsx
//
// FIXED: use class_teachers table (same as AttendanceClient) — NOT class_subjects
//        class_teachers is the actual teacher-assignment table with school_id
// FIXED: students from profiles.class_id (confirmed in schema — profiles has class_id directly)
// FIXED: primary_color from schools.primary_color (via profiles → schools(*) join)
//        No separate school_branding query needed
// FIXED: for results we still need class_subject_id — we resolve it by matching
//        class_id + subject name to class_subjects after loading class_teachers

import { createClient }  from '@/lib/supabase/server'
import { redirect }      from 'next/navigation'
import PostResultsClient from './PostResultsClient'

export default async function TeacherResultsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 1) Profile + school (schools.primary_color is on the schools table directly)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'teacher') redirect('/login')

  const school       = (profile as any).schools ?? null
  const schoolId     = school?.id ?? ''
  const primaryColor = school?.primary_color ?? '#7C3AED'

  // 2) Teacher's class assignments via class_teachers
  //    (same table AttendanceClient uses — has school_id, is_primary, subject text)
  const { data: classTeachers } = await supabase
    .from('class_teachers')
    .select(`
      id,
      class_id,
      subject,
      role_type,
      is_primary,
      classes ( id, name, class_level )
    `)
    .eq('teacher_id', user.id)
    .eq('school_id',  schoolId)

  // 3) Resolve class_subject_id for each assignment
  //    class_subjects links class_id + subject_id; we need the id for results FK
  //    Fetch all class_subjects for this teacher's classes and match by class_id
  const classIds = [...new Set((classTeachers ?? []).map((ct: any) => ct.class_id))]

  let classSubjectsMap: Record<string, any[]> = {} // class_id → class_subjects rows
  if (classIds.length > 0) {
    const { data: csRows } = await supabase
      .from('class_subjects')
      .select('id, class_id, subject_id, teacher_id, subjects(id, name, code)')
      .in('class_id', classIds)

    ;(csRows ?? []).forEach((cs: any) => {
      if (!classSubjectsMap[cs.class_id]) classSubjectsMap[cs.class_id] = []
      classSubjectsMap[cs.class_id].push(cs)
    })
  }

  // Build teacherClasses: one entry per class_teacher row
  // Match to class_subject by: same class_id AND (teacher_id = this teacher OR subject name match)
  const teacherClasses = (classTeachers ?? []).map((ct: any) => {
    const csForClass = classSubjectsMap[ct.class_id] ?? []

    // Prefer a class_subject assigned to this teacher; fall back to subject name match
    let matchedCS = csForClass.find((cs: any) => cs.teacher_id === user.id)
    if (!matchedCS && ct.subject) {
      matchedCS = csForClass.find((cs: any) =>
        cs.subjects?.name?.toLowerCase() === ct.subject?.toLowerCase()
      )
    }
    // If class teacher (is_primary) with no subject, take first cs for the class
    if (!matchedCS && ct.is_primary) matchedCS = csForClass[0]

    return {
      class_subject_id: matchedCS?.id   ?? null,   // may be null if not yet in class_subjects
      class_id:         ct.class_id,
      subject_id:       matchedCS?.subject_id ?? null,
      subject_name:     ct.subject ?? matchedCS?.subjects?.name ?? 'Class Teacher',
      class_name:       ct.classes?.name ?? ct.classes?.class_level ?? '—',
      is_primary:       ct.is_primary ?? false,
    }
  }).sort((a: any, b: any) => {
    // Primary (class) teacher first, then alphabetical
    if (a.is_primary && !b.is_primary) return -1
    if (!a.is_primary && b.is_primary) return 1
    return a.class_name.localeCompare(b.class_name)
  })

  // 4) Students via profiles.class_id (confirmed in schema — profiles has class_id directly)
  let allStudents: any[] = []
  if (classIds.length > 0) {
    const { data: students } = await supabase
      .from('profiles')
      .select('id, full_name, default_code, admission_number, class_id')
      .eq('school_id', schoolId)
      .eq('role',      'student')
      .in('class_id',  classIds)
      .order('full_name')

    allStudents = (students ?? []).map((s: any) => ({
      student_id:     s.id,
      full_name:      s.full_name,
      student_number: s.default_code ?? s.admission_number ?? null,
      class_id:       s.class_id,
    }))
  }

  // 5) Existing results (only for class_subjects that exist)
  const classSubjectIds = teacherClasses
    .map((tc: any) => tc.class_subject_id)
    .filter(Boolean)

  let existingResults: any[] = []
  if (classSubjectIds.length > 0) {
    const { data: existing } = await supabase
      .from('results')
      .select('id, student_id, class_subject_id, result_type, term, score, max_score, grade, approved')
      .eq('school_id', schoolId)
      .in('class_subject_id', classSubjectIds)

    existingResults = existing ?? []
  }

  // 6) Academic year from schools table if stored there, else compute
  const academicYear: string | undefined = (school as any)?.current_academic_year ?? undefined

  return (
    <PostResultsClient
      teacherClasses={teacherClasses}
      allStudents={allStudents}
      existingResults={existingResults}
      teacherId={user.id}
      teacherName={profile.full_name}
      schoolId={schoolId}
      primaryColor={primaryColor}
      academicYear={academicYear}
      profile={profile}
      school={school}
    />
  )
      }
    
