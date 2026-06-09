// src/app/dashboard/principal/results/page.tsx
// FIXED: results table has no subject/class_id/teacher_id columns directly.
//        All lookups go through class_subject_id → class_subjects → subjects + classes
//        Teacher is resolved via results.posted_by → profiles.full_name
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

  // Load classes for filter dropdown
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, class_level, section')
    .eq('school_id', school?.id)
    .order('class_level')

  // Load results for current term with full join chain
  // Note: we load all terms server-side; client filters in-memory to avoid round trips
  const { data: results } = await supabase
    .from('results')
    .select(`
      id,
      student_id,
      term,
      academic_year,
      result_type,
      score,
      max_score,
      grade,
      posted_at,
      class_subject_id,
      posted_by,
      class_subjects (
        id,
        class_id,
        subjects ( id, name, code ),
        classes  ( id, name, class_level, section )
      ),
      poster:profiles!results_posted_by_fkey ( id, full_name ),
      student:profiles!results_student_id_fkey ( id, full_name, admission_number, default_code )
    `)
    .eq('school_id', school?.id)
    .order('posted_at', { ascending: false })
    .limit(2000)

  return (
    <ResultsClient
      profile={profile}
      school={school}
      userId={session.user.id}
      classes={classes ?? []}
      results={results ?? []}
    />
  )
}
