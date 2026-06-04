// src/app/dashboard/principal/classes/page.tsx
// FIX: Loads teacher assignments from class_teachers table
// FIX: Each class now shows its Class Teacher + all Subject Teachers separately

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalClassesClient from './PrincipalClassesClient'

export default async function PrincipalClassesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, school_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['principal', 'admin'].includes((profile as any).role)) {
    redirect('/dashboard/principal')
  }

  const schoolId = (profile as any).school_id

  // Get all classes with student counts
  const { data: classes } = await supabase
    .from('classes')
    .select(`
      id, name, class_level, section, capacity, academic_year,
      student_profiles:profiles ( id )
    `)
    .eq('school_id', schoolId)
    .order('class_level')
    .order('section')

  const classIds = (classes ?? []).map((c: any) => c.id)

  // FIX: Load teacher assignments from class_teachers (not class_subjects)
  // This gives us: which teacher is class teacher, which are subject teachers, and what subjects
  let classTeacherMap: Record<string, {
    class_teacher:    { teacher_id: string; full_name: string } | null
    subject_teachers: { teacher_id: string; full_name: string; subject: string }[]
    teacher_count:    number
  }> = {}

  if (classIds.length > 0) {
    const { data: assignments } = await supabase
      .from('class_teachers')
      .select(`
        class_id, teacher_id, subject, is_primary,
        profiles:teacher_id ( full_name )
      `)
      .in('class_id', classIds)
      .eq('school_id', schoolId)

    ;(assignments ?? []).forEach((a: any) => {
      if (!classTeacherMap[a.class_id]) {
        classTeacherMap[a.class_id] = {
          class_teacher:    null,
          subject_teachers: [],
          teacher_count:    0,
        }
      }

      const entry = classTeacherMap[a.class_id]
      entry.teacher_count++

      if (a.is_primary) {
        // Class teacher — owns this class
        entry.class_teacher = {
          teacher_id: a.teacher_id,
          full_name:  a.profiles?.full_name ?? 'Unknown',
        }
      } else {
        // Subject teacher
        entry.subject_teachers.push({
          teacher_id: a.teacher_id,
          full_name:  a.profiles?.full_name ?? 'Unknown',
          subject:    a.subject ?? 'Unknown Subject',
        })
      }
    })

    // Sort subject teachers alphabetically by subject
    Object.values(classTeacherMap).forEach(entry => {
      entry.subject_teachers.sort((a, b) => a.subject.localeCompare(b.subject))
    })
  }

  // Enrich classes with teacher info
  const enrichedClasses = (classes ?? []).map((c: any) => ({
    ...c,
    student_count:   c.student_profiles?.length ?? 0,
    ...( classTeacherMap[c.id] ?? {
      class_teacher:    null,
      subject_teachers: [],
      teacher_count:    0,
    }),
  }))

  // All active teachers (for assignment modal)
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true)
    .order('full_name')

  // All subjects (for assignment modal)
  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, name, code')
    .eq('school_id', schoolId)
    .order('name')

  return (
    <PrincipalClassesClient
      classes={enrichedClasses}
      teachers={teachers ?? []}
      subjects={subjects ?? []}
      schoolId={schoolId}
      userId={user.id}
    />
  )
}
