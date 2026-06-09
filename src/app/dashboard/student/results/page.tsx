// src/app/dashboard/student/results/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ResultsClient from './ResultsClient'

export default async function ResultsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', session.user.id)
    .single()

  if (!profile) redirect('/login')
  const school = (profile as any)?.schools ?? null

  // Fetch results with subject name via class_subject_id → class_subjects → subjects
  const { data: results } = await supabase
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
    .eq('student_id', session.user.id)
    .order('academic_year', { ascending: false })
    .order('posted_at',     { ascending: false })

  return (
    <ResultsClient
      profile={profile}
      school={school}
      userId={session.user.id}
      results={results ?? []}
    />
  )
}
