'use client'

// src/app/dashboard/bursar/payments/new/NewPaymentClient.tsx

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from './payment.module.css'

interface Props {
  bursarId: string
  bursarName: string
}

interface StudentResult {
  id: string
  full_name: string
  student_number: string | null
  class_name: string | null
}

interface Invoice {
  id: string
  description: string
  term: string
  amount_due: number
  amount_paid: number
  balance: number
  status: string
}

interface Receipt {
  receiptNumber: string
  studentName: string
  className: string | null
  studentNumber: string | null
  amount: number
  currency: 'NGN' | 'USD'
  paymentDate: string
  paymentMethod: string
  invoices: string[]
  bursarName: string
}

// ── Helpers ──────────────────────────────────────────────
function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }

function fmtCurrency(amount: number, currency: 'NGN' | 'USD'): string {
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function generateReceiptNumber(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `RCP-${stamp}-${rand}`
}

// ── Icons ─────────────────────────────────────────────────
const IconChevronLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
const IconSun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconAlertCircle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const IconPrinter = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
const IconDownload = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IconReceipt = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>

// ── Main ──────────────────────────────────────────────────
export default function NewPaymentClient({ bursarId, bursarName }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Student search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StudentResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  // Payment form
  const [amountStr, setAmountStr] = useState('')
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme')
    const dark = saved !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('schoolos_theme', next ? 'dark' : 'light')
  }

  // ── Debounced student search ──────────────────────────
  useEffect(() => {
    if (selectedStudent) return
    if (searchQuery.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('student_profiles')
        .select('id, full_name, student_number, classes(name)')
        .or(`full_name.ilike.%${searchQuery}%,student_number.ilike.%${searchQuery}%`)
        .limit(8)

      setSearchResults(
        (data ?? []).map((s: any) => ({
          id: s.id,
          full_name: s.full_name ?? 'Unknown',
          student_number: s.student_number ?? null,
          class_name: s.classes?.name ?? null,
        }))
      )
      setIsSearching(false)
      setShowDropdown(true)
    }, 300)

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery, selectedStudent])

  // ── Load invoices on student select ──────────────────
  const loadInvoices = useCallback(async (studentId: string) => {
    setLoadingInvoices(true)
    setInvoices([])
    setSelectedInvoices(new Set())

    const supabase = createClient()
    const { data } = await supabase
      .from('fee_invoices')
      .select('id, description, term, amount_due, amount_paid, status')
      .eq('student_id', studentId)
      .neq('status', 'paid')
      .order('term')

    const rows: Invoice[] = (data ?? []).map((inv: any) => ({
      id: inv.id,
      description: inv.description ?? 'School Fees',
      term: inv.term ?? '',
      amount_due: inv.amount_due ?? 0,
      amount_paid: inv.amount_paid ?? 0,
      balance: (inv.amount_due ?? 0) - (inv.amount_paid ?? 0),
      status: inv.status ?? 'unpaid',
    }))

    setInvoices(rows)
    setLoadingInvoices(false)
  }, [])

  function selectStudent(s: StudentResult) {
    setSelectedStudent(s)
    setSearchQuery('')
    setShowDropdown(false)
    setSearchResults([])
    loadInvoices(s.id)
    setReceipt(null)
    setSubmitStatus('idle')
  }

  function clearStudent() {
    setSelectedStudent(null)
    setInvoices([])
    setSelectedInvoices(new Set())
    setAmountStr('')
    setReceipt(null)
    setSubmitStatus('idle')
  }

  function toggleInvoice(id: string) {
    setSelectedInvoices(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Total selected balance
  const selectedBalance = invoices
    .filter(inv => selectedInvoices.has(inv.id))
    .reduce((sum, inv) => sum + inv.balance, 0)

  const amount = parseFloat(amountStr) || 0
  const isOverpay = amount > selectedBalance && selectedBalance > 0
  const canSubmit = selectedStudent !== null && amount > 0 && !isSubmitting

  // ── Submit payment ────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit || !selectedStudent) return
    setIsSubmitting(true)
    setSubmitStatus('idle')

    const supabase = createClient()
    const receiptNum = generateReceiptNumber()

    // Insert payment record
    const { data: paymentData, error: paymentErr } = await supabase
      .from('fee_payments')
      .insert({
        student_id: selectedStudent.id,
        amount,
        currency,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        receipt_number: receiptNum,
        notes: notes || null,
        recorded_by: bursarId,
        invoice_ids: Array.from(selectedInvoices),
      })
      .select('id')
      .single()

    if (paymentErr) {
      setIsSubmitting(false)
      setSubmitStatus('error')
      setErrorMsg(paymentErr.message)
      return
    }

    // Update invoice amount_paid for each selected invoice (distribute proportionally)
    if (selectedInvoices.size > 0) {
      const selectedInvList = invoices.filter(i => selectedInvoices.has(i.id))
      let remaining = amount

      for (const inv of selectedInvList) {
        if (remaining <= 0) break
        const apply = Math.min(remaining, inv.balance)
        const newPaid = inv.amount_paid + apply
        const newStatus = newPaid >= inv.amount_due ? 'paid' : 'partial'

        await supabase
          .from('fee_invoices')
          .update({ amount_paid: newPaid, status: newStatus })
          .eq('id', inv.id)

        remaining -= apply
      }
    }

    setIsSubmitting(false)
    setSubmitStatus('success')

    // Build receipt
    setReceipt({
      receiptNumber: receiptNum,
      studentName: selectedStudent.full_name,
      className: selectedStudent.class_name,
      studentNumber: selectedStudent.student_number,
      amount,
      currency,
      paymentDate,
      paymentMethod,
      invoices: invoices.filter(i => selectedInvoices.has(i.id)).map(i => i.description),
      bursarName,
    })

    // Reload invoices to reflect updated status
    loadInvoices(selectedStudent.id)
  }

  if (!mounted) return null

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────── */}
      <header className={styles.header}>
        <Link href="/dashboard/bursar" className={styles.backBtn}>
          <IconChevronLeft /> Bursar
        </Link>
        <div className={styles.headerCenter}>
          <h1 className={styles.pageTitle}>Record <span>Payment</span></h1>
        </div>
        <button className={styles.themeBtn} onClick={toggleTheme}>
          {isDark ? <IconSun /> : <IconMoon />}
        </button>
      </header>

      {/* ── Body ────────────────────────────────────────── */}
      <div className={styles.body}>

        {/* Left — search + form */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Payment Details</p>
            <p className={styles.panelSubtitle}>Search for a student, select invoices, enter amount</p>
          </div>

          <div className={styles.panelBody}>
            {/* Student search */}
            {!selectedStudent ? (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Student</label>
                <div style={{ position: 'relative' }}>
                  <div className={styles.searchWrap}>
                    <span className={styles.searchIcon}><IconSearch /></span>
                    <input
                      className={styles.searchInput}
                      placeholder="Search by name or admission number…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  {(showDropdown || isSearching) && (
                    <div className={styles.searchResults}>
                      {isSearching ? (
                        <div className={styles.searchingText}>Searching…</div>
                      ) : searchResults.length === 0 ? (
                        <div className={styles.searchingText}>No students found</div>
                      ) : (
                        searchResults.map(s => (
                          <div key={s.id} className={styles.searchResultItem} onClick={() => selectStudent(s)}>
                            <div className={styles.resultAvatar}>{initials(s.full_name)}</div>
                            <div>
                              <p className={styles.resultName}>{s.full_name}</p>
                              <p className={styles.resultMeta}>
                                {s.student_number ?? 'No ID'} · {s.class_name ?? 'No class'}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.selectedStudent}>
                <div className={styles.selectedAvatar}>{initials(selectedStudent.full_name)}</div>
                <div className={styles.selectedInfo}>
                  <p className={styles.selectedName}>{selectedStudent.full_name}</p>
                  <p className={styles.selectedMeta}>
                    {selectedStudent.student_number ?? 'No ID'} · {selectedStudent.class_name ?? 'No class'}
                  </p>
                </div>
                <button className={styles.clearBtn} onClick={clearStudent}><IconX /></button>
              </div>
            )}

            {/* Outstanding invoices */}
            {selectedStudent && (
              <>
                <hr className={styles.divider} />
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Outstanding Invoices
                    {invoices.length > 0 && ` (${invoices.length})`}
                  </label>

                  {loadingInvoices ? (
                    <div className={styles.searchingText}>Loading invoices…</div>
                  ) : invoices.length === 0 ? (
                    <div className={styles.searchingText}>No outstanding invoices — student is fully paid.</div>
                  ) : (
                    <div className={styles.invoiceList}>
                      {invoices.map(inv => (
                        <div
                          key={inv.id}
                          className={`${styles.invoiceRow} ${selectedInvoices.has(inv.id) ? styles.invoiceRowSelected : ''}`}
                          onClick={() => toggleInvoice(inv.id)}
                        >
                          <div className={`${styles.invoiceCheck} ${selectedInvoices.has(inv.id) ? styles.invoiceCheckActive : ''}`}>
                            {selectedInvoices.has(inv.id) && <IconCheck />}
                          </div>
                          <div className={styles.invoiceInfo}>
                            <p className={styles.invoiceDesc}>{inv.description}</p>
                            <p className={styles.invoiceMeta}>{inv.term} · Paid: {fmtCurrency(inv.amount_paid, 'NGN')} of {fmtCurrency(inv.amount_due, 'NGN')}</p>
                          </div>
                          <span className={styles.invoiceBalance}>{fmtCurrency(inv.balance, 'NGN')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Amount + currency */}
            {selectedStudent && invoices.length > 0 && (
              <>
                <hr className={styles.divider} />

                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Amount Paid *</label>
                    <input
                      className={`${styles.fieldInput} ${styles.fieldInputLarge}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={amountStr}
                      onChange={e => setAmountStr(e.target.value)}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Currency</label>
                    <select
                      className={`${styles.fieldInput} ${styles.fieldSelect}`}
                      value={currency}
                      onChange={e => setCurrency(e.target.value as 'NGN' | 'USD')}
                    >
                      <option value="NGN">NGN — Naira</option>
                      <option value="USD">USD — Dollar</option>
                    </select>
                  </div>
                </div>

                {isOverpay && (
                  <p className={`${styles.fieldNote} ${styles.fieldNoteError}`}>
                    ⚠ Amount exceeds selected balance of {fmtCurrency(selectedBalance, currency)}
                  </p>
                )}

                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Payment Method</label>
                    <select
                      className={`${styles.fieldInput} ${styles.fieldSelect}`}
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="pos">POS / Card</option>
                      <option value="cheque">Cheque</option>
                      <option value="online">Online Portal</option>
                    </select>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Payment Date</label>
                    <input
                      type="date"
                      className={styles.fieldInput}
                      value={paymentDate}
                      onChange={e => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Notes (optional)</label>
                  <input
                    className={styles.fieldInput}
                    placeholder="e.g. Bank teller: 0012345678"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                {submitStatus === 'success' && (
                  <div className={`${styles.statusMsg} ${styles.statusSuccess}`}>
                    <IconCheck /> Payment recorded successfully! Receipt generated.
                  </div>
                )}

                {submitStatus === 'error' && (
                  <div className={`${styles.statusMsg} ${styles.statusError}`}>
                    <IconAlertCircle /> {errorMsg || 'Failed to record payment. Please retry.'}
                  </div>
                )}

                <button
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {isSubmitting ? 'Recording…' : `Record ${amount > 0 ? fmtCurrency(amount, currency) : ''} Payment`}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right — receipt preview */}
        <div className={styles.receiptPanel}>
          <div className={styles.receiptHeader}>
            <p className={styles.receiptTitle}>Receipt Preview</p>
            {receipt && <span className={styles.receiptBadge}>Issued</span>}
          </div>

          {!receipt ? (
            <div className={styles.receiptEmpty}>
              <div className={styles.receiptEmptyIcon}><IconReceipt /></div>
              <p className={styles.receiptEmptyText}>
                Complete the payment form to generate a receipt here.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.receiptBody}>
                <div className={styles.receiptSchool}>
                  <p className={styles.receiptSchoolName}>SchoolOS</p>
                  <p className={styles.receiptSchoolSub}>Official Fee Receipt</p>
                </div>

                <div className={styles.receiptAmount}>
                  <p className={styles.receiptAmountValue}>{fmtCurrency(receipt.amount, receipt.currency)}</p>
                  <p className={styles.receiptAmountLabel}>Amount Received</p>
                </div>

                <div className={styles.receiptFields}>
                  <div className={styles.receiptField}>
                    <span className={styles.receiptFieldLabel}>Receipt No.</span>
                    <span className={styles.receiptFieldValue}>{receipt.receiptNumber}</span>
                  </div>
                  <div className={styles.receiptField}>
                    <span className={styles.receiptFieldLabel}>Student</span>
                    <span className={styles.receiptFieldValue}>{receipt.studentName}</span>
                  </div>
                  {receipt.studentNumber && (
                    <div className={styles.receiptField}>
                      <span className={styles.receiptFieldLabel}>Admission No.</span>
                      <span className={styles.receiptFieldValue}>{receipt.studentNumber}</span>
                    </div>
                  )}
                  {receipt.className && (
                    <div className={styles.receiptField}>
                      <span className={styles.receiptFieldLabel}>Class</span>
                      <span className={styles.receiptFieldValue}>{receipt.className}</span>
                    </div>
                  )}
                  <div className={styles.receiptField}>
                    <span className={styles.receiptFieldLabel}>Date</span>
                    <span className={styles.receiptFieldValue}>
                      {new Date(receipt.paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className={styles.receiptField}>
                    <span className={styles.receiptFieldLabel}>Method</span>
                    <span className={styles.receiptFieldValue} style={{ textTransform: 'capitalize' }}>
                      {receipt.paymentMethod.replace('_', ' ')}
                    </span>
                  </div>
                  {receipt.invoices.length > 0 && (
                    <div className={styles.receiptField}>
                      <span className={styles.receiptFieldLabel}>For</span>
                      <span className={styles.receiptFieldValue} style={{ textAlign: 'right', maxWidth: '55%' }}>
                        {receipt.invoices.join(', ')}
                      </span>
                    </div>
                  )}
                  <div className={styles.receiptField}>
                    <span className={styles.receiptFieldLabel}>Issued by</span>
                    <span className={styles.receiptFieldValue}>{receipt.bursarName}</span>
                  </div>
                </div>
              </div>

              <div className={styles.receiptActions}>
                <button className={styles.receiptActionBtn} onClick={() => window.print()}>
                  <IconPrinter /> Print
                </button>
                <button
                  className={styles.receiptActionBtn}
                  onClick={() => {
                    const lines = [
                      'SCHOOLOS FEE RECEIPT',
                      '====================',
                      `Receipt No: ${receipt.receiptNumber}`,
                      `Student: ${receipt.studentName}`,
                      receipt.studentNumber ? `Admission No: ${receipt.studentNumber}` : '',
                      receipt.className ? `Class: ${receipt.className}` : '',
                      `Amount: ${fmtCurrency(receipt.amount, receipt.currency)}`,
                      `Date: ${receipt.paymentDate}`,
                      `Method: ${receipt.paymentMethod}`,
                      receipt.invoices.length ? `For: ${receipt.invoices.join(', ')}` : '',
                      `Issued by: ${receipt.bursarName}`,
                    ].filter(Boolean).join('\n')

                    const blob = new Blob([lines], { type: 'text/plain' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `${receipt.receiptNumber}.txt`
                    a.click()
                    URL.revokeObjectURL(a.href)
                  }}
                >
                  <IconDownload /> Download
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
