// src/app/dashboard/teacher/results/page.tsx
//
// FIXED: class_subjects has no school_id column — removed that filter
//        (teacher_id scoping is sufficient; class → school via classes.school_id)
// FIXED: students live in student_profiles.class_id, not profiles.class_id
//        Query joins profiles → student_profiles to get class assignment
// FIXED: primary_color comes from school_branding, not schools
//        Added school_branding query so PostResultsClient gets the right accent colour

import { createClient }    from '@/lib/supabase/server'
import { redirect }        from 'next/navigation'
import PostResultsClient   from './PostResultsClient'

export default async function TeacherResultsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 1) Teacher profile + school
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'teacher') redirect('/login')

  const school   = (profile as any).schools ?? null
  const schoolId = school?.id ?? ''

  // 2) School branding for primary_color
  //    primary_color lives in school_branding (id = school_id), NOT schools
  const { data: branding } = await supabase
    .from('school_branding')
    .select('primary_color, school_name')
    .eq('id', schoolId)
    .maybeSingle()

  const primaryColor = (branding as any)?.primary_color ?? '#7C3AED'

  // 3) This teacher's class_subjects
  //    NOTE: class_subjects has NO school_id column — filter only by teacher_id
  //    School scoping comes from classes.school_id via the FK chain
  const { data: classSubjects } = await supabase
    .from('class_subjects')
    .select(`
      id,
      class_id,
      subject_id,
      teacher_id,
      subjects ( id, name, code ),
      classes  ( id, name, class_level, school_id )
    `)
    .eq('teacher_id', user.id)

  // Filter to only classes belonging to this school (in JS since no school_id on class_subjects)
  const teacherClassesRaw = (classSubjects ?? []).filter(
    (cs: any) => cs.classes?.school_id === schoolId
  )

  const teacherClasses = teacherClassesRaw.map((cs: any) => ({
    class_subject_id: cs.id,
    class_id:         cs.class_id,
    subject_id:       cs.subject_id,
    subject_name:     cs.subjects?.name ?? '—',
    class_name:       cs.classes?.name ?? cs.classes?.class_level ?? '—',
  }))

  // 4) Students in those classes
  //    IMPORTANT: class_id is on student_profiles, not profiles
  //    Join: profiles → student_profiles to get class_id + admission_number
  const classIds = [...new Set(teacherClasses.map((tc: any) => tc.class_id))]

  let allStudents: any[] = []
  if (classIds.length > 0) {
    const { data: students } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        school_id,
        student_profiles ( class_id, admission_number, student_number )
      `)
      .eq('school_id', schoolId)
      .eq('role', 'student')
      .order('full_name')

    // Filter to students whose student_profiles.class_id is in our set
    allStudents = (students ?? [])
      .filter((s: any) => {
        const sp = Array.isArray(s.student_profiles)
          ? s.student_profiles[0]
          : s.student_profiles
        return sp && classIds.includes(sp.class_id)
      })
      .map((s: any) => {
        const sp = Array.isArray(s.student_profiles)
          ? s.student_profiles[0]
          : s.student_profiles
        return {
          student_id:     s.id,
          full_name:      s.full_name,
          student_number: sp?.student_number ?? sp?.admission_number ?? null,
          class_id:       sp?.class_id ?? null,
        }
      })
  }

  // 5) Existing results for pre-filling scores
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

  // 6) Academic year from school_settings if available
  let academicYear: string | undefined
  try {
    const { data: settings } = await supabase
      .from('school_settings')
      .select('current_academic_year')
      .eq('school_id', schoolId)
      .maybeSingle()
    academicYear = (settings as any)?.current_academic_year ?? undefined
  } catch {
    // table may not exist — PostResultsClient computes it from the calendar
  }

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
    />
  )
    }
                               
