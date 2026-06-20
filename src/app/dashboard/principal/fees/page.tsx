// src/app/dashboard/principal/fees/page.tsx
//
// Fixed: this page was rendering the placeholder `FeesClient.tsx` (queries
// the dead `school_fees` table, shows raw item.id as a fallback title).
// The properly-built `PrincipalFeesClient.tsx` already existed in the repo
// but was never wired up — it had no page.tsx fetching the props it needs
// (stats, classFees, recentPayments, overdueInvoices, schoolId).
//
// UPDATE: previously this page silently guessed the current term from the
// calendar month, with no way for the principal to see or change that guess.
// If the school's actual term didn't match the calendar assumption (e.g.
// it's June but the school is still in First Term), the dashboard would
// show all zeros with zero indication of why. It now reads term/year from
// the URL (?term=first&year=2025/2026), defaulting to the calendar guess
// only when no params are provided, and the client renders a picker that
// navigates via those params — same pattern as the bursar's term/year tabs.
//
// This page fetches everything from the same live tables the rest of
// the app uses: fee_structures, payment_invoices, payments, profiles.

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { unwrapEmbed }  from '@/lib/utils/unwrapEmbed'
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

export default async function PrincipalFeesPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; year?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null

  if (!school) redirect('/login')

  const params  = await searchParams
  // Only fall back to the calendar guess if the principal hasn't picked a
  // term/year explicitly — once they do, the URL params take over so the
  // dashboard never silently shows the "wrong" term with no explanation.
  const termKey = params.term ?? getCurrentTermKey()
  const year    = params.year ?? getCurrentAcademicYear()

  // ── Pull all invoices for the selected term/year, with student info ──
  const { data: invoices } = await supabase
    .from('payment_invoices')
    .select(`
      id, amount_due_ngn, amount_paid_ngn, balance_ngn, status, due_date,
      fee_structures ( term, academic_year ),
      profiles!student_id ( id, full_name, class_level )
    `)
    .eq('school_id', school.id)

  // Filter client-side to the selected term/year (2nd-level nested filters
  // aren't reliably applied by PostgREST — same caveat as the bursar pages).
  // Embeds can come back as object OR 1-element array, so unwrap before reading.
  const termInvoices = (invoices ?? []).filter((inv: any) => {
    const fs = unwrapEmbed(inv.fee_structures)
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
  // NOTE: intentionally NOT filtered by term/year — "recent" means recent,
  // so the principal can always see latest activity regardless of which
  // term they're viewing in the Overview/Classes/Overdue tabs.
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
      currentTerm={termKey}
      currentYear={year}
    />
  )
    }
