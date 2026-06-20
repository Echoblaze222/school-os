'use client'

// src/app/dashboard/bursar/record-payment/RecordPaymentClient.tsx
//
// Matches the prop contract of the REAL page.tsx:
//   userId, profile, school, bursarId, schoolInfo, usdRate, rateUpdatedAt
//
// Fixed vs the old broken version:
//   - Searches `profiles` (not the nonexistent `student_profiles`)
//   - Loads `payment_invoices` (not the nonexistent `fee_invoices`)
//   - Writes to `payments` table — the one actually wired to payment_invoices
//     via invoice_id FK and to digital_receipts. (`fee_payments` has no link
//     to invoices at all and was the wrong target.)
//   - Supports NGN + USD using the real exchange_rates-driven usdRate prop,
//     matching payments.amount_paid_ngn / amount_paid_usd / currency_used / exchange_rate

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import type { SchoolInfo } from './page'

interface Props {
  userId:        string
  profile:       any
  school:        any
  bursarId:      string
  schoolInfo:    SchoolInfo
  usdRate:       number
  rateUpdatedAt: string | null
}

interface StudentResult {
  id:          string
  full_name:   string
  class_level: string | null
  admission_number: string | null
  permanent_student_id: string | null
}

interface Invoice {
  id:            string
  description:   string
  term:          string
  academic_year: string
  amount_due:    number
  amount_paid:   number
  balance:       number
  status:        string
}

interface ReceiptData {
  receiptNumber:    string
  studentName:      string
  className:        string | null
  admissionNumber:  string | null
  amount:           number
  currency:         'NGN' | 'USD'
  paymentMethod:    string
  paymentDate:      string
  feesDescription:  string[]
  bursarName:       string
  schoolName:       string
}

function generateReceiptNumber(): string {
  const d     = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand  = Math.floor(1000 + Math.random() * 9000)
  return `RCP-${stamp}-${rand}`
}

function fmtCurrency(amount: number, currency: 'NGN' | 'USD'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: '💵 Cash' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'pos',           label: '💳 POS / Card' },
]

const TERM_LABELS: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}

export default function RecordPaymentClient({
  userId, profile, school, bursarId, schoolInfo, usdRate, rateUpdatedAt,
}: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [mounted, setMounted] = useState(false)
  const [isDark,  setIsDark]  = useState(true)

  // Student search
  const [searchQuery,     setSearchQuery]      = useState(searchParams.get('student') ?? '')
  const [searchResults,   setSearchResults]    = useState<StudentResult[]>([])
  const [isSearching,     setIsSearching]      = useState(false)
  const [selectedStudent, setSelectedStudent]  = useState<StudentResult | null>(null)
  const [showDropdown,    setShowDropdown]     = useState(false)

  // Invoices
  const [invoices,         setInvoices]         = useState<Invoice[]>([])
  const [selectedInvoices, setSelectedInvoices]  = useState<Set<string>>(new Set())
  const [loadingInvoices,  setLoadingInvoices]  = useState(false)

  // Payment form
  const [currency,      setCurrency]      = useState<'NGN' | 'USD'>('NGN')
  const [amountStr,     setAmountStr]     = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentDate,   setPaymentDate]   = useState(() => new Date().toISOString().split('T')[0])
  const [reference,     setReference]     = useState('')
  const [notes,         setNotes]         = useState('')

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg,     setErrorMsg]     = useState('')
  const [receipt,      setReceipt]      = useState<ReceiptData | null>(null)

  // Invoice preview expand
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  function toggleExpand(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpandedInvoice(prev => prev === id ? null : id)
  }

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schoolId   = schoolInfo.school_id || school?.id || ''
  const schoolName = schoolInfo.school_name || school?.name || 'School'
  const bursarName = profile?.full_name ?? 'Bursar'

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('schoolos_theme')
    if (saved === 'light') {
      setIsDark(false)
      document.documentElement.setAttribute('data-theme', 'light')
    }
    const invoiceId = searchParams.get('invoice')
    if (invoiceId) loadSingleInvoice(invoiceId)
  }, [])

  async function loadSingleInvoice(invoiceId: string) {
    setLoadingInvoices(true)
    const { data } = await supabase
      .from('payment_invoices')
      .select(`
        id, amount_due_ngn, amount_paid_ngn, balance_ngn, status,
        fee_structures ( description, term, academic_year ),
        profiles!student_id ( id, full_name, class_level, admission_number, permanent_student_id )
      `)
      .eq('id', invoiceId)
      .single()

    if (data) {
      const student = unwrapEmbed((data as any).profiles)
      if (student) {
        setSelectedStudent({
          id:                   student.id,
          full_name:            student.full_name,
          class_level:          student.class_level,
          admission_number:     student.admission_number,
          permanent_student_id: student.permanent_student_id,
        })
        setSearchQuery(student.full_name)
      }
      const fs = unwrapEmbed((data as any).fee_structures)
      setInvoices([{
        id:            data.id,
        description:   fs?.description ?? 'School Fees',
        term:          fs?.term ?? '',
        academic_year: fs?.academic_year ?? '',
        amount_due:    (data as any).amount_due_ngn,
        amount_paid:   (data as any).amount_paid_ngn,
        balance:       (data as any).balance_ngn,
        status:        (data as any).status,
      }])
      setSelectedInvoices(new Set([data.id]))
    }
    setLoadingInvoices(false)
  }

  // Debounced search — queries `profiles` (correct table; was `student_profiles`)
  useEffect(() => {
    if (selectedStudent) return
    if (searchQuery.length < 2) { setSearchResults([]); setShowDropdown(false); return }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, class_level, admission_number, permanent_student_id')
        .eq('school_id', schoolId)
        .eq('role', 'student')
        .eq('is_active', true)
        .or(`full_name.ilike.%${searchQuery}%,admission_number.ilike.%${searchQuery}%,permanent_student_id.ilike.%${searchQuery}%`)
        .limit(10)

      setSearchResults(data ?? [])
      setShowDropdown(true)
      setIsSearching(false)
    }, 350)

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery, selectedStudent, schoolId])

  // Load invoices when student selected — queries `payment_invoices` (correct table; was `fee_invoices`)
  const loadInvoices = useCallback(async (studentId: string) => {
    setLoadingInvoices(true)
    const { data } = await supabase
      .from('payment_invoices')
      .select(`
        id, amount_due_ngn, amount_paid_ngn, balance_ngn, status,
        fee_structures ( description, term, academic_year )
      `)
      .eq('student_id', studentId)
      .eq('school_id', schoolId)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })

    setInvoices((data ?? []).map((inv: any) => {
      const fs = unwrapEmbed(inv.fee_structures)
      return {
        id:            inv.id,
        description:   fs?.description ?? 'School Fees',
        term:          fs?.term ?? '',
        academic_year: fs?.academic_year ?? '',
        amount_due:    inv.amount_due_ngn,
        amount_paid:   inv.amount_paid_ngn,
        balance:       inv.balance_ngn,
        status:        inv.status,
      }
    }))
    setSelectedInvoices(new Set())
    setLoadingInvoices(false)
  }, [schoolId])

  function selectStudent(s: StudentResult) {
    setSelectedStudent(s)
    setSearchQuery(s.full_name)
    setShowDropdown(false)
    setInvoices([])
    setSelectedInvoices(new Set())
    loadInvoices(s.id)
  }

  function clearStudent() {
    setSelectedStudent(null)
    setSearchQuery('')
    setInvoices([])
    setSelectedInvoices(new Set())
    setReceipt(null)
    setErrorMsg('')
  }

  function toggleInvoice(id: string) {
    setSelectedInvoices(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const amount          = parseFloat(amountStr) || 0
  // Balance is always stored in NGN on the invoice; convert for display/limit-check if USD selected
  const totalBalanceNgn = invoices
    .filter(i => selectedInvoices.has(i.id))
    .reduce((s, i) => s + i.balance, 0)
  const totalBalanceDisplay = currency === 'USD' ? totalBalanceNgn / usdRate : totalBalanceNgn
  const amountInNgn     = currency === 'USD' ? amount * usdRate : amount
  const canSubmit       = !!selectedStudent && amount > 0 && amountInNgn <= totalBalanceNgn + 0.5

  async function handleSubmit() {
    if (!canSubmit || !selectedStudent) return
    setIsSubmitting(true)
    setErrorMsg('')

    const receiptNum      = generateReceiptNumber()
    const selectedInvList = invoices.filter(i => selectedInvoices.has(i.id))

    // payments table links directly to ONE invoice via invoice_id FK.
    // If multiple invoices are selected, record one payments row per invoice,
    // splitting the amount across each invoice's balance in order.
    let remainingNgn = amountInNgn
    const paymentRows: any[] = []

    for (const inv of selectedInvList) {
      if (remainingNgn <= 0) break
      const applyNgn = Math.min(remainingNgn, inv.balance)
      const applyUsd = currency === 'USD' ? applyNgn / usdRate : null

      paymentRows.push({
        invoice_id:         inv.id,
        student_id:         selectedStudent.id,
        received_by:        bursarId,
        amount_paid_ngn:    applyNgn,
        amount_paid_usd:    applyUsd,
        currency_used:      currency,
        exchange_rate:      currency === 'USD' ? usdRate : null,
        receipt_number:     selectedInvList.length > 1 ? `${receiptNum}-${inv.id.slice(0, 4)}` : receiptNum,
        payment_method:     paymentMethod,
        payment_reference:  reference || null,
        notes:              notes || null,
        paid_at:            new Date(paymentDate).toISOString(),
        school_id:          schoolId,
      })

      remainingNgn -= applyNgn
    }

    const { error: payErr } = await supabase.from('payments').insert(paymentRows)

    if (payErr) {
      setErrorMsg(payErr.message)
      setIsSubmitting(false)
      return
    }

    // Update each selected payment_invoice with new paid/balance/status
    let remaining2 = amountInNgn
    for (const inv of selectedInvList) {
      if (remaining2 <= 0) break
      const apply     = Math.min(remaining2, inv.balance)
      const newPaid   = inv.amount_paid + apply
      const newBal    = inv.amount_due - newPaid
      const newStatus = newPaid >= inv.amount_due ? 'completed' : 'partial'

      await supabase
        .from('payment_invoices')
        .update({
          amount_paid_ngn: newPaid,
          balance_ngn:     Math.max(0, newBal),
          status:          newStatus,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', inv.id)

      remaining2 -= apply
    }

    setReceipt({
      receiptNumber:   receiptNum,
      studentName:     selectedStudent.full_name,
      className:       selectedStudent.class_level,
      admissionNumber: selectedStudent.permanent_student_id ?? selectedStudent.admission_number,
      amount,
      currency,
      paymentMethod,
      paymentDate,
      feesDescription: selectedInvList.map(i => i.description),
      bursarName,
      schoolName,
    })

    setIsSubmitting(false)
    loadInvoices(selectedStudent.id)
  }

  if (!mounted) return null

  // ── Receipt View ──────────────────────────────────────
  if (receipt) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '16px' }}>
        <div style={{
          maxWidth: 480, margin: '0 auto', background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ background: '#7C3AED', padding: '20px 24px', textAlign: 'center' }}>
            <p style={{ color: '#ffffff99', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', margin: 0 }}>
              PAYMENT RECEIPT
            </p>
            <p style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 900, margin: '4px 0 0' }}>
              {receipt.receiptNumber}
            </p>
          </div>

          <div style={{ padding: '20px 24px' }}>
            <div style={{ textAlign: 'center', margin: '0 0 20px' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', margin: 0 }}>
                AMOUNT PAID
              </p>
              <p style={{ fontSize: '2rem', fontWeight: 900, color: '#10B981', margin: '4px 0 0' }}>
                {fmtCurrency(receipt.amount, receipt.currency)}
              </p>
            </div>

            {[
              ['School',      receipt.schoolName],
              ['Student',     receipt.studentName],
              ['Class',       receipt.className ?? '—'],
              ['Adm. No.',    receipt.admissionNumber ?? '—'],
              ['Date',        receipt.paymentDate],
              ['Method',      receipt.paymentMethod.replace('_', ' ').toUpperCase()],
              ['Recorded by', receipt.bursarName],
              ['Fees',        receipt.feesDescription.join(', ')],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '10px 0', borderBottom: '1px solid var(--glass-border)',
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right', maxWidth: '60%' }}>
                  {value}
                </span>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => window.print()}
                style={{
                  flex: 1, height: 44, background: '#7C3AED', color: '#fff',
                  border: 'none', borderRadius: 10, fontWeight: 700,
                  fontSize: '0.85rem', cursor: 'pointer',
                }}>
                🖨️ Print Receipt
              </button>
              <button
                onClick={() => { setReceipt(null); clearStudent() }}
                style={{
                  flex: 1, height: 44, background: 'var(--input-bg)',
                  color: 'var(--text-primary)', border: '1px solid var(--input-border)',
                  borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                }}>
                New Payment
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main Form ─────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px',
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.85rem',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '0 0 80px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px', borderBottom: '1px solid var(--glass-border)',
      }}>
        <button onClick={() => router.back()} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)', fontSize: '1.4rem', lineHeight: 1, padding: 0,
        }}>←</button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
          Record Payment
        </h1>
        <button onClick={() => {
          const next = isDark ? 'light' : 'dark'
          setIsDark(!isDark)
          localStorage.setItem('schoolos_theme', next)
          document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
        }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      <div style={{ padding: '16px', maxWidth: 560, margin: '0 auto' }}>

        {/* ── Step 1: Student search ── */}
        <div style={{
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          borderRadius: 14, padding: 16, marginBottom: 14,
        }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', margin: '0 0 10px' }}>
            STEP 1 — SELECT STUDENT
          </p>

          {selectedStudent ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: '#7C3AED15',
              border: '1px solid #7C3AED40', borderRadius: 10,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: '#7C3AED', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0,
              }}>
                {selectedStudent.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {selectedStudent.full_name}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {selectedStudent.class_level ?? '—'}
                  {selectedStudent.permanent_student_id ? ` · ${selectedStudent.permanent_student_id}` : ''}
                </p>
              </div>
              <button onClick={clearStudent} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '1.1rem',
              }}>✕</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search by name or admission number…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={inp}
              />
              {isSearching && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '6px 0 0', padding: '0 4px' }}>
                  Searching…
                </p>
              )}
              {showDropdown && searchResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                  borderRadius: 10, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                }}>
                  {searchResults.map(s => (
                    <div
                      key={s.id}
                      onClick={() => selectStudent(s)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer',
                        borderBottom: '1px solid var(--glass-border)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#7C3AED15')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {s.full_name}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        {s.class_level ?? '—'} · {s.permanent_student_id ?? s.admission_number ?? '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {showDropdown && !isSearching && searchResults.length === 0 && searchQuery.length >= 2 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '6px 0 0', padding: '0 4px' }}>
                  No students found.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: Select invoices ── */}
        {selectedStudent && (
          <div style={{
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            borderRadius: 14, padding: 16, marginBottom: 14,
          }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', margin: '0 0 10px' }}>
              STEP 2 — SELECT OUTSTANDING INVOICES
            </p>

            {loadingInvoices ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                Loading invoices…
              </p>
            ) : invoices.length === 0 ? (
              <div style={{
                padding: '16px', background: '#10B98110', border: '1px solid #10B98130',
                borderRadius: 10, textAlign: 'center',
              }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10B981', margin: 0 }}>
                  ✓ No outstanding invoices
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  This student has no pending fees.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invoices.map(inv => {
                  const selected  = selectedInvoices.has(inv.id)
                  const termLabel = TERM_LABELS[inv.term] ?? inv.term
                  return (
                    <div
                      key={inv.id}
                      onClick={() => toggleInvoice(inv.id)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 0,
                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        border: `1px solid ${selected ? '#7C3AED60' : 'var(--glass-border)'}`,
                        background: selected ? '#7C3AED10' : 'var(--input-bg)',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                          border: `2px solid ${selected ? '#7C3AED' : 'var(--input-border)'}`,
                          background: selected ? '#7C3AED' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selected && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            {inv.description}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                            {termLabel}{inv.academic_year ? ` · ${inv.academic_year}` : ''}
                          </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <span style={{
                            fontSize: '0.82rem', fontWeight: 800,
                            color: inv.status === 'partial' ? '#F59E0B' : '#EF4444',
                          }}>
                            ₦{inv.balance.toLocaleString()}
                          </span>
                          <button
                            onClick={e => toggleExpand(inv.id, e)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>
                            {expandedInvoice === inv.id ? '▲ less' : '▼ more'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expandedInvoice === inv.id && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          {[
                            { label: 'Due',     val: `₦${inv.amount_due.toLocaleString()}`,  color: 'var(--text-primary)' },
                            { label: 'Paid',    val: `₦${inv.amount_paid.toLocaleString()}`, color: 'var(--success)' },
                            { label: 'Balance', val: `₦${inv.balance.toLocaleString()}`,     color: inv.balance > 0 ? 'var(--error)' : 'var(--success)' },
                          ].map(({ label, val, color }) => (
                            <div key={label} style={{ background: 'var(--glass-bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                              <p style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 3px' }}>{label.toUpperCase()}</p>
                              <p style={{ fontSize: '0.82rem', fontWeight: 800, color, margin: 0 }}>{val}</p>
                            </div>
                          ))}
                          <div style={{ gridColumn: '1/-1' }}>
                            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0 }}>
                              Status: <span style={{ fontWeight: 700, color: inv.status === 'partial' ? '#F59E0B' : inv.status === 'completed' ? 'var(--success)' : '#EF4444' }}>
                                {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Payment details ── */}
        {selectedStudent && selectedInvoices.size > 0 && (
          <div style={{
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            borderRadius: 14, padding: 16, marginBottom: 14,
          }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              STEP 3 — PAYMENT DETAILS
            </p>

            <div style={{
              padding: '10px 14px', background: '#7C3AED10',
              border: '1px solid #7C3AED30', borderRadius: 10, marginBottom: 14, textAlign: 'center',
            }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', margin: 0 }}>
                TOTAL SELECTED BALANCE
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 900, color: '#7C3AED', margin: '4px 0 0' }}>
                {fmtCurrency(totalBalanceDisplay, currency)}
              </p>
              {currency === 'USD' && (
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  ≈ ₦{totalBalanceNgn.toLocaleString()} at ₦{usdRate.toLocaleString()}/$
                  {rateUpdatedAt ? ` · updated ${new Date(rateUpdatedAt).toLocaleDateString()}` : ''}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  AMOUNT + CURRENCY *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number" placeholder={`Max: ${totalBalanceDisplay.toFixed(currency === 'USD' ? 2 : 0)}`}
                    value={amountStr} onChange={e => setAmountStr(e.target.value)}
                    style={{ ...inp, flex: 1 }}
                  />
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value as 'NGN' | 'USD')}
                    style={{ ...inp, width: 110, flexShrink: 0 }}>
                    <option value="NGN">NGN — Naira</option>
                    <option value="USD">USD — Dollar</option>
                  </select>
                </div>
                {amountInNgn > totalBalanceNgn + 0.5 && (
                  <p style={{ fontSize: '0.72rem', color: '#EF4444', margin: '4px 0 0', padding: '0 4px' }}>
                    ⚠ Amount exceeds selected balance of {fmtCurrency(totalBalanceDisplay, currency)}
                  </p>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  PAYMENT METHOD *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => setPaymentMethod(m.value)}
                      style={{
                        padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontWeight: 700,
                        fontSize: '0.75rem', textAlign: 'center',
                        border: `1.5px solid ${paymentMethod === m.value ? '#7C3AED' : 'var(--input-border)'}`,
                        background: paymentMethod === m.value ? '#7C3AED15' : 'var(--input-bg)',
                        color: paymentMethod === m.value ? '#7C3AED' : 'var(--text-muted)',
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  PAYMENT DATE *
                </label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inp} />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  REFERENCE / TELLER NO. (optional)
                </label>
                <input
                  placeholder="Bank teller number or transaction ref"
                  value={reference} onChange={e => setReference(e.target.value)}
                  style={inp}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  NOTES (optional)
                </label>
                <textarea
                  rows={2} placeholder="Any additional notes…"
                  value={notes} onChange={e => setNotes(e.target.value)}
                  style={{ ...inp, height: 'auto', resize: 'none', padding: '10px 14px' }}
                />
              </div>
            </div>

            {errorMsg && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: '#EF444415', border: '1px solid #EF444440',
                borderRadius: 8, fontSize: '0.8rem', color: '#EF4444', fontWeight: 600,
              }}>
                ⚠️ {errorMsg}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              style={{
                width: '100%', height: 48, marginTop: 16,
                background: canSubmit ? '#7C3AED' : 'var(--input-bg)',
                color: canSubmit ? '#fff' : 'var(--text-muted)',
                border: canSubmit ? 'none' : '1px solid var(--input-border)',
                borderRadius: 12, fontWeight: 800, fontSize: '0.95rem',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                opacity: isSubmitting ? 0.7 : 1,
              }}>
              {isSubmitting
                ? 'Recording…'
                : canSubmit
                  ? `Record ${fmtCurrency(amount, currency)} Payment`
                  : 'Enter amount to continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
