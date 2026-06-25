// src/app/dashboard/student/results/page.tsx
// FIXED: added school_id filter to results query (RLS safety + multi-tenant correctness)
// FIXED: cast results to ResultRow[] to avoid Supabase inferred array-join type mismatch
//        (Supabase infers FK joins as arrays; our interface expects a single object | null)

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import ResultsClient, { type ResultRow } from './ResultsClient'

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

  if (schoolId) {
    resultsQuery.eq('school_id', schoolId)
  }

  const { data: results } = await resultsQuery

  // Cast needed: Supabase infers FK joins as T[] but our interface uses T | null
  // (class_subjects is a many-to-one FK from results — always a single row)
  const typedResults = (results ?? []) as unknown as ResultRow[]

  return (
    <ResultsClient
      profile={profile}
      school={school}
      userId={user.id}
      results={typedResults}
    />
  )
                             }
           
