// src/app/dashboard/teacher/results/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ResultsClient from './ResultsClient'

export default async function ResultsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  const school = (profile as any)?.schools ?? null

  // Load teacher's assigned classes via class_teachers junction
  const { data: classTeachers } = await supabase
    .from('class_teachers')
    .select(`
      id,
      class_id,
      subject,
      role_type,
      classes ( id, name, class_level, section )
    `)
    .eq('teacher_id', profile.id)
    .eq('school_id', school?.id)

  // For each class_teacher row, resolve the class_subject_id
  const teacherClasses: any[] = []
  for (const ct of classTeachers ?? []) {
    // Find class_subject matching this class + subject (teacher may or may not be set on class_subjects)
    const { data: cs } = await supabase
      .from('class_subjects')
      .select('id, subject_id, subjects(id, name, code)')
      .eq('class_id', ct.class_id)
      .or(`teacher_id.eq.${profile.id},teacher_id.is.null`)
      .limit(1)
      .maybeSingle()

    teacherClasses.push({
      class_id:         ct.class_id,
      class_name:       (ct as any).classes?.name ?? (ct as any).classes?.class_level ?? '—',
      class_level:      (ct as any).classes?.class_level ?? '',
      subject:          ct.subject ?? (cs as any)?.subjects?.name ?? '—',
      class_subject_id: cs?.id ?? null,
    })
  }

  return (
    <ResultsClient
      profile={profile}
      school={school}
      userId={user.id}
      teacherClasses={teacherClasses}
    />
  )
}
