import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BursarDashboardClient from './BursarDashboardClient'

function getCurrentTermAndYear() {
  const now   = new Date()
  const month = now.getMonth()        // 0-indexed
  const year  = now.getFullYear()

  let term: string
  let academicYear: string

  if (month >= 8) {                   // Sep–Dec → First Term
    term         = 'First Term'
    academicYear = `${year}/${year + 1}`
  } else if (month <= 2) {            // Jan–Mar → Second Term
    term         = 'Second Term'
    academicYear = `${year - 1}/${year}`
  } else {                            // Apr–Jul → Third Term
    term         = 'Third Term'
    academicYear = `${year - 1}/${year}`
  }

  return { term, academicYear }
}

export default async function BursarDashboardPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school     = (profile as any)?.schools ?? null
  const schoolId   = school?.id
  const { term, academicYear } = getCurrentTermAndYear()

  // ── Real stats ──────────────────────────────────────────
  const [
    { data: payments },
    { data: allStudents },
  ] = await Promise.all([
    supabase.from('fee_payments').select('student_id, amount')
      .eq('school_id', schoolId).eq('term', term).eq('academic_year', academicYear),
    supabase.from('profiles').select('id')
      .eq('school_id', schoolId).eq('role', 'student'),
  ])

  const payList    = payments    ?? []
  const studList   = allStudents ?? []

  const totalCollected  = payList.reduce((s, p) => s + (p.amount ?? 0), 0)
  const paidStudentIds  = new Set(payList.map(p => p.student_id).filter(Boolean))
  const paidCount       = paidStudentIds.size
  const pendingCount    = Math.max(0, studList.length - paidCount)
  const collectionRate  = studList.length > 0
    ? Math.round((paidCount / studList.length) * 100)
    : 0

  // Outstanding: we show paid vs total students (no fee structure required)
  const outstanding = pendingCount   // number of students who haven't paid

  return (
    <BursarDashboardClient
      profile={profile}
      school={school}
      userId={session.user.id}
      counts={{
        totalCollected,
        outstanding,
        paidCount,
        pendingCount,
        collectionRate,
        currentTerm: term,
      }}
    />
  )
}
