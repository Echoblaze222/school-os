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

const payList   = payments      ?? []
const studList  = allStudents   ?? []
const feeList   = feeStructures ?? []

const totalCollected  = payList.reduce((s, p) => s + ((p as any).amount_paid_ngn ?? 0), 0)  // ← was .amount
const feePerStudent   = feeList.reduce((s, f) => s + ((f as any).amount ?? 0), 0)
const totalExpected   = feePerStudent * studList.length
const outstanding     = Math.max(0, totalExpected - totalCollected)  // ← now naira not student count

const paidStudentIds  = new Set(payList.map((p: any) => p.student_id).filter(Boolean))
const paidCount       = paidStudentIds.size
const pendingCount    = pendingClaimsCount ?? 0  // ← this should be claims, not unpaid students
const collectionRate  = totalExpected > 0
  ? Math.round((totalCollected / totalExpected) * 100)
  : 0

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
