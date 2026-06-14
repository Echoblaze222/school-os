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

  const school   = (profile as any)?.schools ?? null
  const schoolId = school?.id
  const { term, academicYear } = getCurrentTermAndYear()

  // Payments received this term
  const { data: payments } = await supabase
    .from('payments')
    .select('amount_paid_ngn, student_id')
    .eq('school_id', schoolId)

  // All students in the school
  const { data: allStudents } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('role', 'student')

  // Expected fees for this term/year (sum of fee_structures across all classes)
  const { data: feeStructures } = await supabase
    .from('fee_structures')
    .select('amount_ngn, class_id')
    .eq('school_id', schoolId)
    .eq('term', term)
    .eq('academic_year', academicYear)

  // Pending invoices count (as "pending claims" proxy)
  const { count: pendingClaimsCount } = await supabase
    .from('payment_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('status', 'pending')

  const payList   = payments      ?? []
  const studList  = allStudents   ?? []
  const feeList   = feeStructures ?? []

  const totalCollected = payList.reduce((s, p) => s + ((p as any).amount_paid_ngn ?? 0), 0)
  const feePerStudent  = feeList.reduce((s, f) => s + ((f as any).amount_ngn ?? 0), 0)
  const totalExpected  = feePerStudent * studList.length
  const outstanding    = Math.max(0, totalExpected - totalCollected)

  const paidStudentIds = new Set(payList.map((p: any) => p.student_id).filter(Boolean))
  const paidCount      = paidStudentIds.size
  const pendingCount   = Math.max(0, studList.length - paidCount)
  const collectionRate = totalExpected > 0
    ? Math.round((totalCollected / totalExpected) * 100)
    : 0

  return (
    <BursarDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={{
        totalCollected,
        outstanding,
        paidCount,
        pendingCount,
        collectionRate,
        currentTerm:   term,
        pendingClaims: pendingClaimsCount ?? 0,
      }}
    />
  )
}
