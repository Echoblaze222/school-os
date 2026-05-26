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

  if (!profile || profile.role !== 'principal') redirect('/dashboard/principal')

  // Get all classes with student counts and teacher info
  const { data: classes } = await supabase
    .from('classes')
    .select(`
      id, level, section, stream, capacity, academic_year,
      student_profiles ( count ),
      class_subjects (
        id,
        profiles!teacher_id ( full_name ),
        subjects ( name )
      )
    `)
    .eq('school_id', profile.school_id)
    .order('level')
    .order('section')

  // Get all teachers for assignment
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('school_id', profile.school_id)
    .eq('role', 'teacher')
    .eq('is_active', true)
    .order('full_name')

  // Get all subjects
  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, name, code')
    .eq('school_id', profile.school_id)
    .order('name')

  return (
    <PrincipalClassesClient
      classes={classes ?? []}
      teachers={teachers ?? []}
      subjects={subjects ?? []}
      schoolId={profile.school_id}
      userId={user.id}
    />
  )
}
