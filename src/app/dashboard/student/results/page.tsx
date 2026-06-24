// src/app/dashboard/student/results/page.tsx
// FIXED: added school_id filter to results query (RLS safety + multi-tenant correctness)
// FIXED: results.student_id is profiles.id — query uses user.id which is correct
// FIXED: join path class_subjects → subjects + classes is correct for subject name resolution

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import ResultsClient    from './ResultsClient'

export default async function ResultsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load profile + school in one query
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  const school   = (profile as any)?.schools ?? null
  const schoolId = school?.id ?? null

  // Fetch this student's results with full subject + class info
  // Scoped to school_id for multi-tenant safety and RLS compliance
  const resultsQuery = supabase
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
    .eq('student_id', user.id)
    .order('academic_year', { ascending: false })
    .order('posted_at',     { ascending: false })

  // Add school_id filter if we have one (protects against cross-school data leaks)
  if (schoolId) {
    resultsQuery.eq('school_id', schoolId)
  }

  const { data: results } = await resultsQuery

  return (
    <ResultsClient
      profile={profile}
      school={school}
      userId={user.id}
      results={results ?? []}
    />
  )
}
  
