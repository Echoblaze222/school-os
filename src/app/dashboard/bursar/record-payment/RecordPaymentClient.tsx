'use client'

// src/app/dashboard/bursar/record-payment/RecordPaymentClient.tsx
// Fixed: queries profiles + payment_invoices (correct tables)
// Fixed: inserts correct columns into fee_payments

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  bursarId:   string
  bursarName: string
  schoolId:   string
}

interface StudentResult {
  id:          string
  full_name:   string
  class_level: string | null
  admission_number: string | null
  permanent_student_id: string | null
}

interface Invoice {
  id:          string
  description: string
  term:        string
  amount_due:  number
  amount_paid: number
  balance:     number
  status:      string
}

interface ReceiptData {
  receiptNumber:    string
  studentName:      string
  className:        string | null
  admissionNumber:  string | null
  amount:           number
  paymentMethod:    string
  paymentDate:      string
  feesDescription:  string[]
  bursarName:       string
  schoolName:       string
}

function generateReceiptNumber(): string {
  const d    = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand  = Math.floor(1000 + Math.random() * 9000)
  return `RCP-${stamp}-${rand}`
}

function fmt(amount: number) {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: '💵 Cash' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'pos',           label: '💳 POS / Card' },
]

export default function RecordPaymentClient({ bursarId, bursarName, schoolId }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [mounted,         setMounted]         = useState(false)
  const [isDark,          setIsDark]           = useState(true)

  // Student search
  const [searchQuery,     setSearchQuery]      = useState(searchParams.get('student') ?? '')
  const [searchResults,   setSearchResults]    = useState<StudentResult[]>([])
  const [isSearching,     setIsSearching]      = useState(false)
  const [selectedStudent, setSelectedStudent]  = useState<StudentResult | null>(null)
  const [showDropdown,    setShowDropdown]     = useState(false)

  // Invoices
  const [invoices,         setInvoices]        = useState<Invoice[]>([])
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [loadingInvoices,  setLoadingInvoices] = useState(false)

  // Payment form
  const [amountStr,    setAmountStr]    = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentDate,  setPaymentDate]  = useState(() => new Date().toISOString().split('T')[0])
  const [reference,    setReference]    = useState('')
  const [notes,        setNotes]        = useState('')
  const [term,         setTerm]         = useState('First Term')

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg,     setErrorMsg]     = useState('')
  const [receipt,      setReceipt]      = useState<ReceiptData | null>(null)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('schoolos_theme')
    if (saved === 'light') {
      setIsDark(false)
      document.documentElement.setAttribute('data-theme', 'light')
    }
    // If came from invoice link, pre-load
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
      const student = (data as any)['profiles!student_id']
      if (student) {
        setSelectedStudent({
          id:                  student.id,
          full_name:           student.full_name,
          class_level:         student.class_level,
          admission_number:    student.admission_number,
          permanent_student_id: student.permanent_student_id,
        })
        setSearchQuery(student.full_name)
      }
      const fs = (data as any).fee_structures
      setInvoices([{
        id:          data.id,
        description: fs?.description ?? 'School Fees',
        term:        fs?.term ?? '',
        amount_due:  (data as any).amount_due_ngn,
        amount_paid: (data as any).amount_paid_ngn,
        balance:     (data as any).balance_ngn,
        status:      (data as any).status,
      }])
      setSelectedInvoices(new Set([data.id]))
    }
    setLoadingInvoices(false)
  }

  // Debounced search — queries `profiles` table (correct)
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
  }, [searchQuery, selectedStudent])

  // Load invoices when student selected — queries `payment_invoices` (correct)
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

    setInvoices((data ?? []).map((inv: any) => ({
      id:          inv.id,
      description: inv.fee_structures?.description ?? 'School Fees',
      term:        inv.fee_structures?.term ?? '',
      amount_due:  inv.amount_due_ngn,
      amount_paid: inv.amount_paid_ngn,
      balance:     inv.balance_ngn,
      status:      inv.status,
    })))
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

  const amount        = parseFloat(amountStr) || 0
  const totalBalance  = invoices
    .filter(i => selectedInvoices.has(i.id))
    .reduce((s, i) => s + i.balance, 0)
  const canSubmit = selectedStudent && amount > 0 && amount <= totalBalance + 0.01

  async function handleSubmit() {
    if (!canSubmit || !selectedStudent) return
    setIsSubmitting(true)
    setErrorMsg('')

    const receiptNum  = generateReceiptNumber()
    const selectedInvList = invoices.filter(i => selectedInvoices.has(i.id))

    // Determine term from first selected invoice
    const invTerm = selectedInvList[0]?.term ?? 'First Term'
    const termLabel = invTerm === 'first' ? 'First Term'
      : invTerm === 'second' ? 'Second Term'
      : invTerm === 'third'  ? 'Third Term'
      : invTerm

    // 1. Insert into fee_payments with correct columns
    const { error: payErr } = await supabase
      .from('fee_payments')
      .insert({
        school_id:      schoolId,
        student_id:     selectedStudent.id,
        student_name:   selectedStudent.full_name,
        class_level:    selectedStudent.class_level ?? '',
        amount:         amount,
        term:           termLabel,
        academic_year:  selectedInvList[0]
          ? (selectedInvList[0] as any)?.academic_year ?? ''
          : '',
        fee_type:       'school_fees',
        payment_method: paymentMethod,
        reference:      reference || null,
        receipt_number: receiptNum,
        notes:          notes || null,
        recorded_by:    bursarId,
      })

    if (payErr) {
      setErrorMsg(payErr.message)
      setIsSubmitting(false)
      return
    }

    // 2. Update each selected payment_invoice
    let remaining = amount
    for (const inv of selectedInvList) {
      if (remaining <= 0) break
      const apply    = Math.min(remaining, inv.balance)
      const newPaid  = inv.amount_paid + apply
      const newBal   = inv.amount_due - newPaid
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

      remaining -= apply
    }

    // Build receipt
    setReceipt({
      receiptNumber:   receiptNum,
      studentName:     selectedStudent.full_name,
      className:       selectedStudent.class_level,
      admissionNumber: selectedStudent.permanent_student_id ?? selectedStudent.admission_number,
      amount,
      paymentMethod,
      paymentDate,
      feesDescription: selectedInvList.map(i => i.description),
      bursarName,
      schoolName:      '',
    })

    setIsSubmitting(false)
    // Reload invoices to show updated balances
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
          {/* Receipt header */}
          <div style={{ background: '#7C3AED', padding: '20px 24px', textAlign: 'center' }}>
            <p style={{ color: '#ffffff99', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', margin: 0 }}>
              PAYMENT RECEIPT
            </p>
            <p style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 900, margin: '4px 0 0' }}>
              {receipt.receiptNumber}
            </p>
          </div>

          <div style={{ padding: '20px 24px' }}>
            {/* Amount */}
            <div style={{ textAlign: 'center', margin: '0 0 20px' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', margin: 0 }}>
                AMOUNT PAID
              </p>
              <p style={{ fontSize: '2rem', fontWeight: 900, color: '#10B981', margin: '4px 0 0' }}>
                {fmt(receipt.amount)}
              </p>
            </div>

            {/* Details */}
            {[
              ['Student',    receipt.studentName],
              ['Class',      receipt.className ?? '—'],
              ['Adm. No.',   receipt.admissionNumber ?? '—'],
              ['Date',       receipt.paymentDate],
              ['Method',     receipt.paymentMethod.replace('_', ' ').toUpperCase()],
              ['Recorded by', receipt.bursarName],
              ['Fees',       receipt.feesDescription.join(', ')],
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

            {/* Actions */}
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
      {/* Header */}
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
                        transition: 'background 0.15s',
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
                  const selected = selectedInvoices.has(inv.id)
                  const termLabel = inv.term === 'first' ? 'First Term'
                    : inv.term === 'second' ? 'Second Term'
                    : inv.term === 'third'  ? 'Third Term'
                    : inv.term
                  return (
                    <div
                      key={inv.id}
                      onClick={() => toggleInvoice(inv.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        border: `1px solid ${selected ? '#7C3AED60' : 'var(--glass-border)'}`,
                        background: selected ? '#7C3AED10' : 'var(--input-bg)',
                        transition: 'all 0.15s',
                      }}>
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
                          {termLabel} · Balance: {fmt(inv.balance)}
                        </p>
                      </div>
                      <span style={{
                        fontSize: '0.82rem', fontWeight: 800,
                        color: inv.status === 'partial' ? '#F59E0B' : '#EF4444',
                      }}>
                        {fmt(inv.balance)}
                      </span>
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

            {/* Total balance selected */}
            <div style={{
              padding: '10px 14px', background: '#7C3AED10',
              border: '1px solid #7C3AED30', borderRadius: 10, marginBottom: 14, textAlign: 'center',
            }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', margin: 0 }}>
                TOTAL SELECTED BALANCE
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 900, color: '#7C3AED', margin: '4px 0 0' }}>
                {fmt(totalBalance)}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  AMOUNT PAID (₦) *
                </label>
                <input
                  type="number" placeholder={`Max: ${totalBalance}`}
                  value={amountStr} onChange={e => setAmountStr(e.target.value)}
                  style={inp}
                />
                {amount > totalBalance + 0.01 && (
                  <p style={{ fontSize: '0.72rem', color: '#EF4444', margin: '4px 0 0', padding: '0 4px' }}>
                    Amount cannot exceed outstanding balance of {fmt(totalBalance)}
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
                        fontSize: '0.75rem', textAlign: 'center', transition: 'all 0.15s',
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
                opacity: isSubmitting ? 0.7 : 1, transition: 'all 0.2s',
              }}>
              {isSubmitting ? 'Recording…' : canSubmit ? `Record ${fmt(amount)} Payment` : 'Enter amount to continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
