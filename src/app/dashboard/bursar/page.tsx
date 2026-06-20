// src/app/dashboard/bursar/page.tsx
//
// Fixed two bugs:
//
// 1. `totalCollected` summed ALL payments ever made, with zero term/year
//    filtering — unlike every other bursar screen (History, Receipts,
//    Reports, Invoices), which all filter strictly by the selected term.
//    This is why a payment with no invoice link (see confirm-claim fix)
//    could show up here while being invisible everywhere else: this card
//    never excluded it in the first place, no matter what term it belonged to.
//
// 2. `term` was computed as the display label ('First Term', 'Second Term',
//    'Third Term'), but fee_structures.term actually stores the lowercase
//    key ('first', 'second', 'third'). The `.eq('term', term)` filter on
//    feeStructures was therefore never matching anything correctly — a
//    separate, pre-existing bug independent of the one above.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import BursarDashboardClient from './BursarDashboardClient'

const TERM_LABELS: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}

function getCurrentTermAndYear() {
  const now   = new Date()
  const month = now.getMonth()
  const year  = now.getFullYear()

  let termKey: string
  let academicYear: string

  if (month >= 8) {
    termKey      = 'first'
    academicYear = `${year}/${year + 1}`
  } else if (month <= 2) {
    termKey      = 'second'
    academicYear = `${year - 1}/${year}`
  } else {
    termKey      = 'third'
    academicYear = `${year - 1}/${year}`
  }

  return { termKey, academicYear }
}

export default async function BursarDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  const school   = (profile as any)?.schools ?? null
  const schoolId = school?.id
  const { termKey, academicYear } = getCurrentTermAndYear()

  // Payments received THIS TERM ONLY — joined through payment_invoices ->
  // fee_structures, since payments has no direct term/year column.
  // A payment with no invoice_id (e.g. an orphaned claim confirmation that
  // had no invoice to link to) is correctly excluded here, matching how
  // History/Receipts/Reports already behave.
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      amount_paid_ngn, student_id,
      payment_invoices ( fee_structures ( term, academic_year ) )
    `)
    .eq('school_id', schoolId)

  // Filter to the current term/year client-side — embeds can come back as
  // object OR 1-element array, and PostgREST doesn't reliably apply filters
  // on a 2nd-level nested embed, so we verify here instead of trusting a
  // server-side .eq() on the nested path.
  const termPayments = (payments ?? []).filter((p: any) => {
    const inv = unwrapEmbed(p.payment_invoices)
    const fs  = unwrapEmbed(inv?.fee_structures)
    return fs && fs.term === termKey && fs.academic_year === academicYear
  })

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
    .eq('term', termKey)
    .eq('academic_year', academicYear)

  // Pending invoices count (as "pending claims" proxy)
  const { count: pendingClaimsCount } = await supabase
    .from('payment_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('status', 'pending')

  const studList  = allStudents   ?? []
  const feeList   = feeStructures ?? []

  const totalCollected = termPayments.reduce((s, p) => s + ((p as any).amount_paid_ngn ?? 0), 0)
  const feePerStudent  = feeList.reduce((s, f) => s + ((f as any).amount_ngn ?? 0), 0)
  const totalExpected  = feePerStudent * studList.length
  const outstanding    = Math.max(0, totalExpected - totalCollected)

  const paidStudentIds = new Set(termPayments.map((p: any) => p.student_id).filter(Boolean))
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
        currentTerm:   TERM_LABELS[termKey] ?? termKey,
        pendingClaims: pendingClaimsCount ?? 0,
      }}
    />
  )
}
