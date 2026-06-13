// src/app/dashboard/bursar/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BursarDashboardClient from './BursarDashboardClient'

function getCurrentTermAndYear() {
  const now   = new Date()
  const month = now.getMonth()
  const year  = now.getFullYear()

  let term: string
  let academicYear: string

  if (month >= 8) {
    term         = 'First Term'
    academicYear = `${year}/${year + 1}`
  } else if (month <= 2) {
    term         = 'Second Term'
    academicYear = `${year - 1}/${year}`
  } else {
    term         = 'Third Term'
    academicYear = `${year - 1}/${year}`
  }

  return { term, academicYear }
}

export default async function BursarDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  const school     = (profile as any)?.schools ?? null
  const schoolId   = school?.id
  const { term, academicYear } = getCurrentTermAndYear()

  const [
    { data: payments },
    { data: allStudents },
    { count: pendingClaimsCount },
  ] = await Promise.all([
    supabase.from('fee_payments')
      .select('student_id, amount')
      .eq('school_id', schoolId)
      .eq('term', term)
      .eq('academic_year', academicYear),

    supabase.from('profiles')
      .select('id')
      .eq('school_id', schoolId)
      .eq('role', 'student'),

    // Pre-fetch pending claims count for SSR (realtime takes over client-side)
    supabase.from('payment_claims')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'pending'),
  ])

  const payList   = payments    ?? []
  const studList  = allStudents ?? []

  const totalCollected = payList.reduce((s, p) => s + ((p as any).amount ?? 0), 0)
  const paidStudentIds = new Set(payList.map((p: any) => p.student_id).filter(Boolean))
  const paidCount      = paidStudentIds.size
  const pendingCount   = Math.max(0, studList.length - paidCount)
  const collectionRate = studList.length > 0
    ? Math.round((paidCount / studList.length) * 100)
    : 0

  return (
    <BursarDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={{
        totalCollected,
        outstanding:   pendingCount,
        paidCount,
        pendingCount,
        collectionRate,
        currentTerm:   term,
        pendingClaims: pendingClaimsCount ?? 0,
      }}
    />
  )
}
