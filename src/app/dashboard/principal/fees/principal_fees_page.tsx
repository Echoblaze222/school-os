// src/app/dashboard/principal/fees/page.tsx
//
// Fixed: this page was rendering the placeholder `FeesClient.tsx` (queries
// the dead `school_fees` table, shows raw item.id as a fallback title).
// The properly-built `PrincipalFeesClient.tsx` already existed in the repo
// but was never wired up — it had no page.tsx fetching the props it needs
// (stats, classFees, recentPayments, overdueInvoices, schoolId).
//
// This page now fetches everything from the same live tables the rest of
// the app uses: fee_structures, payment_invoices, payments, profiles.

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import PrincipalFeesClient from './PrincipalFeesClient'

function getCurrentTermKey(): string {
  const m = new Date().getMonth()
  if (m >= 8) return 'first'
  if (m <= 2) return 'second'
  return 'third'
}
function getCurrentAcademicYear(): string {
  const m = new Date().getMonth()
  const y = new Date().getFullYear()
  return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

export default async function PrincipalFeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null

  if (!school) redirect('/login')

  const termKey = getCurrentTermKey()
  const year    = getCurrentAcademicYear()

  // ── Pull all invoices for the current term/year, with student info ──
  const { data: invoices } = await supabase
    .from('payment_invoices')
    .select(`
      id, amount_due_ngn, amount_paid_ngn, balance_ngn, status, due_date,
      fee_structures ( term, academic_year ),
      profiles!student_id ( id, full_name, class_level )
    `)
    .eq('school_id', school.id)

  // Filter client-side to the current term/year (2nd-level nested filters
  // aren't reliably applied by PostgREST — same caveat as the bursar pages).
  const termInvoices = (invoices ?? []).filter((inv: any) => {
    const fs = inv.fee_structures
    return fs && fs.term === termKey && fs.academic_year === year
  })

  // ── Aggregate stats ──
  const stats = {
    totalExpected:  termInvoices.reduce((s, i: any) => s + (i.amount_due_ngn ?? 0), 0),
    totalCollected: termInvoices.reduce((s, i: any) => s + (i.amount_paid_ngn ?? 0), 0),
    totalBalance:   termInvoices.reduce((s, i: any) => s + (i.balance_ngn ?? 0), 0),
    fullyPaid:      termInvoices.filter((i: any) => i.status === 'completed').length,
    partial:        termInvoices.filter((i: any) => i.status === 'partial').length,
    pending:        termInvoices.filter((i: any) => i.status === 'pending').length,
    overdue:        termInvoices.filter((i: any) =>
      i.status !== 'completed' && i.due_date && new Date(i.due_date) < new Date()
    ).length,
  }

  // ── Overdue invoices (due date passed, not fully paid) ──
  const overdueInvoices = termInvoices
    .filter((i: any) => i.status !== 'completed' && i.due_date && new Date(i.due_date) < new Date())
    .sort((a: any, b: any) => b.balance_ngn - a.balance_ngn)
    .slice(0, 50)

  // ── Recent payments (last 20, from the real `payments` table) ──
  const { data: recentPaymentsRaw } = await supabase
    .from('payments')
    .select(`
      id, receipt_number, paid_at, amount_paid_ngn, amount_paid_usd, currency_used,
      profiles!student_id ( id, full_name, class_level )
    `)
    .eq('school_id', school.id)
    .order('paid_at', { ascending: false })
    .limit(20)

  return (
    <PrincipalFeesClient
      stats={stats}
      classFees={termInvoices}
      recentPayments={recentPaymentsRaw ?? []}
      overdueInvoices={overdueInvoices}
      schoolId={school.id}
    />
  )
}
