// src/app/dashboard/student/alumni-archive/page.tsx
//
// NOTE: this is a NEW route — StudentAlumniClient.tsx existed in the repo
// but nothing rendered it. AlumniClient.tsx (the alumni *network* directory)
// keeps the /dashboard/student/alumni URL since it's already working; this
// "My Records" archive (own results / fee receipts / transcript request)
// gets its own route instead.
//
// ASSUMPTIONS — please confirm against your actual schema:
//   1. `transcript_requests` table exists (StudentAlumniClient already
//      inserts into it) with columns: student_id, status, requested_at.
//   2. Fee history comes from `fee_payments` (confirmed real table — used by
//      bursar/parent), NOT a separate `receipts` table. `fee_payments` has
//      no `description` or `receipt_url` column in the rest of the app, so
//      those are best-effort here: `description` falls back to the payment
//      method, and `receipt_url` is left null until receipt PDFs are wired
//      up (the download button simply won't render without it).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentAlumniClient from './StudentAlumniClient'
import type { AlumniProfile, AlumniResult, AlumniReceipt } from './types'

export default async function StudentAlumniArchivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'student') redirect('/login')

  const school = (profile as any)?.schools ?? null

  // student_profiles holds class_id / admission_number / lifecycle_stage
  const { data: sp } = await supabase
    .from('student_profiles')
    .select('class_id, admission_number, graduation_year, lifecycle_stage')
    .eq('id', user.id)
    .single()

  const { data: classRow } = sp?.class_id
    ? await supabase.from('classes').select('name').eq('id', sp.class_id).single()
    : { data: null as any }

  const alumniProfile: AlumniProfile = {
    full_name:        profile.full_name ?? '—',
    avatar_url:        profile.avatar_url ?? null,
    class_name:        classRow?.name ?? null,
    graduation_year:   sp?.graduation_year ?? null,
    admission_number:  sp?.admission_number ?? null,
    lifecycle_stage:   sp?.lifecycle_stage ?? null,
  }

  const [
    { data: resultRows },
    { data: paymentRows },
    { data: transcriptRow },
  ] = await Promise.all([
    supabase
      .from('results')
      .select('id, class_subject_id, term, academic_year, score, max_score, grade, approved')
      .eq('student_id', user.id)
      .eq('approved', true)
      .order('academic_year', { ascending: false }),

    supabase
      .from('fee_payments')
      .select('id, amount, payment_method, payment_date, receipt_number')
      .eq('student_id', user.id)
      .eq('status', 'paid')
      .order('payment_date', { ascending: false }),

    supabase
      .from('transcript_requests')
      .select('status')
      .eq('student_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // results.select doesn't carry subject name directly — resolve via class_subjects if you
  // track it there; left as class_subject_id for now since the exact join wasn't confirmed.
  const results: AlumniResult[] = (resultRows ?? []).map((r: any) => ({
    id:            r.id,
    subject:       r.subject ?? '—',        // adjust once the subject join is confirmed
    class_name:    alumniProfile.class_name ?? '—',
    term:          r.term,
    academic_year: r.academic_year,
    score:         r.score,
    grade:         r.grade ?? '—',
  }))

  const receipts: AlumniReceipt[] = (paymentRows ?? []).map((p: any) => ({
    id:             p.id,
    amount_ngn:     p.amount,
    description:    p.payment_method ?? 'Fee payment',
    paid_at:        p.payment_date,
    receipt_number: p.receipt_number ?? '—',
    receipt_url:    null,   // not yet wired — see note above
  }))

  return (
    <StudentAlumniClient
      userId={user.id}
      profile={profile}
      school={school}
      studentId={user.id}
      alumniProfile={alumniProfile}
      results={results}
      receipts={receipts}
      transcriptStatus={transcriptRow?.status ?? null}
    />
  )
}
