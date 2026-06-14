// src/app/dashboard/parent/results/page.tsx
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

  // Resolve linked child — profiles.parent_id references the parent's profile id
  const { data: child } = await supabase
    .from('profiles')
    .select('id, full_name, class_level, class_id, admission_number')
    .eq('parent_id', user.id)
    .eq('role', 'student')
    .single()

  let results: any[] = []
  if (child) {
    const { data } = await supabase
      .from('results')
      .select(`
        id,
        term,
        academic_year,
        result_type,
        score,
        max_score,
        grade,
        remarks,
        posted_at,
        class_subjects (
          id,
          subjects ( id, name, code ),
          classes  ( id, name, class_level )
        )
      `)
      .eq('student_id', child.id)
      .order('academic_year', { ascending: false })
      .order('posted_at',     { ascending: false })
    results = data ?? []
  }

  return (
    <ResultsClient
      profile={profile}
      school={school}
      userId={user.id}
      child={child ?? null}
      results={results}
    />
  )
}
