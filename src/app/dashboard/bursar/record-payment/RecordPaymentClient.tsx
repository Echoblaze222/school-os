'use client'
// src/app/dashboard/bursar/record-payment/RecordPaymentClient.tsx

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter }        from 'next/navigation'
import { createClient }     from '@/lib/supabase/client'
import RolePageWrapper      from '@/components/RolePageWrapper'
import styles               from './record-payment.module.css'
import type { SchoolInfo }  from './page'

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
  id:               string
  full_name:        string
  admission_number: string
  class_name:       string
  avatar_url:       string | null
}

interface PendingInvoice {
  id:              string
  description:     string
  term:            string
  academic_year:   string
  amount_due_ngn:  number
  amount_paid_ngn: number
  balance_ngn:     number
  status:          string
}

interface Receipt { receiptNumber: string; paymentId: string; pdfUrl?: string }

type Step     = 1 | 2 | 3 | 4
type Method   = 'Cash' | 'Bank Transfer' | 'Card' | 'Online'
type Currency = 'NGN' | 'USD'

const METHOD_ICONS: Record<Method, string> = {
  Cash: '💵', 'Bank Transfer': '🏦', Card: '💳', Online: '🌐',
}

function fmtNGN(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', maximumFractionDigits: 0,
  }).format(n)
}
function fmtUSD(n: number, rate: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n / rate)
}
function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function genReceipt() {
  return `RCP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function StepDots({ step, total = 4 }: { step: Step; total?: number }) {
  return (
    <div className={styles.stepDots}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`${styles.dot} ${step > i + 1 ? styles.dotDone : ''} ${step === i + 1 ? styles.dotActive : ''}`}
        >
          {step > i + 1 ? '✓' : i + 1}
        </div>
      ))}
    </div>
  )
}

export default function RecordPaymentClient({
  userId, profile, school, bursarId, schoolInfo, usdRate, rateUpdatedAt,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [step,       setStep]       = useState<Step>(1)
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<StudentResult[]>([])
  const [searching,  setSearching]  = useState(false)
  const [student,    setStudent]    = useState<StudentResult | null>(null)
  const [invoices,   setInvoices]   = useState<PendingInvoice[]>([])
  const [loadInv,    setLoadInv]    = useState(false)
  const [invoice,    setInvoice]    = useState<PendingInvoice | null>(null)
  const [amount,     setAmount]     = useState('')
  const [currency,   setCurrency]   = useState<Currency>('NGN')
  const [method,     setMethod]     = useState<Method>('Cash')
  const [reference,  setReference]  = useState('')
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitErr,  setSubmitErr]  = useState('')
  const [receipt,    setReceipt]    = useState<Receipt | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('schoolos_theme') ?? 'dark',
    )
  }, [])

  const amountNGN = (() => {
    const v = parseFloat(amount)
    if (isNaN(v) || v <= 0) return 0
    return currency === 'NGN' ? v : Math.round(v * usdRate)
  })()

  // ── Student search ────────────────────────────────────────────────────────
  // FIX: `admission_number` does NOT exist on `profiles` — it lives in
  // `student_profiles`. Searching with .or('admission_number.ilike…') on
  // `profiles` returns nothing. We search only by full_name here and also
  // do a separate lookup by admission number via student_profiles when the
  // query looks like an admission number (starts with a letter + digits).
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) { setResults([]); return }
    setSearching(true)

    const schoolId = schoolInfo.school_id || ''

    // Primary: search by name on profiles
    const namePromise = supabase
      .from('profiles')
      .select('id, full_name, avatar_url, class_level, default_code')
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .ilike('full_name', `%${trimmed}%`)
      .limit(8)

    // Secondary: search by admission_number in student_profiles, then join profile
    const admissionPromise = supabase
      .from('student_profiles')
      .select('user_id, admission_number')
      .ilike('admission_number', `%${trimmed}%`)
      .limit(8)

    const [{ data: byName }, { data: byAdm }] = await Promise.all([
      namePromise,
      admissionPromise,
    ])

    // Collect all user IDs from admission search
    const admUserIds = (byAdm ?? []).map((r: any) => r.user_id as string)

    // If there are admission matches, fetch their profiles (filter to same school)
    let byAdmProfiles: any[] = []
    if (admUserIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, class_level, default_code')
        .eq('role', 'student')
        .eq('school_id', schoolId)
        .in('id', admUserIds)
      byAdmProfiles = data ?? []
    }

    // Merge, de-duplicate by id
    const seen = new Set<string>()
    const merged: any[] = []
    for (const r of [...(byName ?? []), ...byAdmProfiles]) {
      if (!seen.has(r.id)) { seen.add(r.id); merged.push(r) }
    }

    // Build admission_number map from the student_profiles result
    const admMap: Record<string, string> = {}
    for (const r of byAdm ?? []) admMap[r.user_id] = r.admission_number

    setResults(
      merged.map(r => ({
        id:               r.id,
        full_name:        r.full_name   ?? 'Unknown',
        admission_number: admMap[r.id]  ?? r.default_code ?? '—',
        class_name:       r.class_level ?? '—',
        avatar_url:       r.avatar_url  ?? null,
      })),
    )
    setSearching(false)
  }, [supabase, schoolInfo.school_id])

  function onQuery(q: string) {
    setQuery(q)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(q), 280)
  }

  // ── Pick student → load invoices ──────────────────────────────────────────
  async function pickStudent(s: StudentResult) {
    setStudent(s); setResults([]); setQuery(''); setLoadInv(true); setStep(2)

    const { data } = await supabase
      .from('payment_invoices')
      .select(`
        id, amount_due_ngn, amount_paid_ngn, balance_ngn, status, due_date,
        fee_structures ( description, term, academic_year )
      `)
      .eq('student_id', s.id)
      .in('status', ['unpaid', 'pending', 'partial', 'overdue'])
      .order('due_date', { ascending: true })

    setInvoices(
      (data ?? []).map((inv: any) => ({
        id:              inv.id,
        description:     (inv.fee_structures as any)?.description ?? 'School Fees',
        term:            (inv.fee_structures as any)?.term        ?? '',
        academic_year:   (inv.fee_structures as any)?.academic_year ?? '',
        amount_due_ngn:  inv.amount_due_ngn  ?? 0,
        amount_paid_ngn: inv.amount_paid_ngn ?? 0,
        balance_ngn:     inv.balance_ngn     ?? 0,
        status:          inv.status          ?? 'unpaid',
      })),
    )
    setLoadInv(false)
  }

  function pickInvoice(inv: PendingInvoice) {
    setInvoice(inv)
    setAmount(String(inv.balance_ngn))
    setCurrency('NGN')
    setStep(3)
  }

  // ── Submit payment ────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!student || !invoice || amountNGN <= 0) {
      setSubmitErr('Please fill all fields.')
      return
    }
    if (amountNGN > invoice.balance_ngn) {
      setSubmitErr(`Exceeds balance of ${fmtNGN(invoice.balance_ngn)}`)
      return
    }
    setSubmitting(true); setSubmitErr('')
    const receiptNumber = genReceipt()

    const { data: pmtRow, error: pmtErr } = await supabase
      .from('payments')
      .insert({
        student_id:        student.id,
        invoice_id:        invoice.id,
        received_by:       bursarId,
        school_id:         schoolInfo.school_id || null,
        amount_paid_ngn:   amountNGN,
        currency_used:     currency,
        payment_method:    method,
        payment_reference: reference.trim() || null,
        notes:             notes.trim()     || null,
        receipt_number:    receiptNumber,
        paid_at:           new Date().toISOString(),
      })
      .select('id')
      .single()

    if (pmtErr) { setSubmitErr(pmtErr.message); setSubmitting(false); return }

    // Also record in fee_payments ledger
    await supabase.from('fee_payments').insert({
      school_id:      schoolInfo.school_id || null,
      student_id:     student.id,
      invoice_id:     invoice.id,
      student_name:   student.full_name,
      class_level:    student.class_name,
      description:    invoice.description,
      term:           invoice.term,
      academic_year:  invoice.academic_year,
      amount:         amountNGN,
      currency:       currency,
      payment_method: method,
      reference:      reference.trim() || null,
      receipt_number: receiptNumber,
      notes:          notes.trim()     || null,
      status:         'paid',
      recorded_by:    bursarId,
    })

    // Update invoice balance
    const newPaid   = invoice.amount_paid_ngn + amountNGN
    const newBal    = Math.max(0, invoice.balance_ngn - amountNGN)
    const newStatus = newBal <= 0 ? 'paid' : 'partial'
    await supabase
      .from('payment_invoices')
      .update({ amount_paid_ngn: newPaid, balance_ngn: newBal, status: newStatus })
      .eq('id', invoice.id)

    // Generate PDF receipt (non-fatal if it fails)
    let pdfUrl: string | undefined
    try {
      const res = await fetch('/api/receipts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: pmtRow.id }),
      })
      if (res.ok) { const d = await res.json(); pdfUrl = d.url }
    } catch { /* non-fatal */ }

    setReceipt({ receiptNumber, paymentId: pmtRow.id, pdfUrl })
    setSubmitting(false)
    setStep(4)
  }

  function handleNew() {
    setStep(1); setStudent(null); setInvoice(null); setInvoices([])
    setAmount(''); setReference(''); setNotes(''); setSubmitErr(''); setReceipt(null)
    setMethod('Cash'); setCurrency('NGN')
  }

  function handlePrint() {
    if (!student || !invoice || !receipt) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>${receipt.receiptNumber}</title>
    <style>
      body{font-family:Georgia,serif;max-width:400px;margin:40px auto;color:#1a1015}
      h1{font-size:1.3rem;margin-bottom:4px}
      .school{font-size:.82rem;color:#5a4850;margin-bottom:20px}
      .no{background:#f7f3f0;border:1px solid #e0d8d0;border-radius:8px;padding:8px 14px;font-size:.85rem;font-weight:700;letter-spacing:.06em;margin-bottom:18px}
      table{width:100%;border-collapse:collapse}
      td{padding:9px 0;border-bottom:1px solid #e8e0e0;font-size:.85rem}
      td:first-child{color:#7a6070;width:40%}td:last-child{font-weight:600;text-align:right}
      .amt{font-size:1.2rem;color:#800020;font-weight:700}
      .foot{margin-top:24px;font-size:.72rem;color:#9a8890;text-align:center}
      @media print{body{margin:16px}}
    </style>
    </head><body>
    <h1>${schoolInfo.school_name}</h1>
    <p class="school">Official Payment Receipt</p>
    <div class="no">Receipt: ${receipt.receiptNumber}</div>
    <table>
      <tr><td>Student</td><td>${student.full_name}</td></tr>
      <tr><td>Admission No.</td><td>${student.admission_number}</td></tr>
      <tr><td>Class</td><td>${student.class_name}</td></tr>
      <tr><td>Invoice</td><td>${invoice.description}</td></tr>
      <tr><td>Amount Paid</td><td class="amt">${fmtNGN(amountNGN)}</td></tr>
      <tr><td>USD Equiv</td><td>${fmtUSD(amountNGN, usdRate)}</td></tr>
      <tr><td>Method</td><td>${method}</td></tr>
      <tr><td>Reference</td><td>${reference || '—'}</td></tr>
      <tr><td>Date</td><td>${new Date().toLocaleString('en-NG')}</td></tr>
      <tr><td>New Balance</td><td>${fmtNGN(Math.max(0, invoice.balance_ngn - amountNGN))}</td></tr>
    </table>
    <p class="foot">Computer-generated receipt — ${schoolInfo.school_name}</p>
    </body></html>`)
    w.document.close(); w.print()
  }

  // ── Wizard content ────────────────────────────────────────────────────────
  const wizardContent = (
    <>
      <StepDots step={step}/>

      <div className={styles.main}>

        {/* STEP 1 — Find Student */}
        {step === 1 && (
          <div className={`animate-fade-up ${styles.stepWrap}`}>
            <h2 className={styles.stepTitle}>Find Student</h2>
            <div className={styles.searchBox}>
              <svg
                className={styles.searchIco} width="16" height="16"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className={`input ${styles.searchInput}`}
                value={query}
                onChange={e => onQuery(e.target.value)}
                placeholder="Student name or admission number…"
                autoFocus
              />
              {searching && <span className={styles.searchSpinner}/>}
            </div>

            {results.length > 0 && (
              <div className={styles.dropdown}>
                {results.map(s => (
                  <button key={s.id} className={styles.dropItem} onClick={() => pickStudent(s)}>
                    <div className={styles.dropAvatar}>
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt={s.full_name} className={styles.dropAvatarImg}/>
                        : <span>{initials(s.full_name)}</span>}
                    </div>
                    <div className={styles.dropInfo}>
                      <span className={styles.dropName}>{s.full_name}</span>
                      <span className={styles.dropMeta}>{s.class_name} · {s.admission_number}</span>
                    </div>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                    >
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {query.length >= 2 && !searching && results.length === 0 && (
              <div className={styles.noResults}>
                <p>No student found for &ldquo;{query}&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Select Invoice */}
        {step === 2 && student && (
          <div className={`animate-fade-up ${styles.stepWrap}`}>
            <div className={styles.studentChip}>
              <div className={styles.chipAvatar}>
                {student.avatar_url
                  ? <img src={student.avatar_url} alt={student.full_name} className={styles.dropAvatarImg}/>
                  : <span>{initials(student.full_name)}</span>}
              </div>
              <div>
                <span className={styles.chipName}>{student.full_name}</span>
                <span className={styles.chipMeta}>{student.class_name} · {student.admission_number}</span>
              </div>
              <button
                className={styles.chipChange}
                onClick={() => { setStep(1); setStudent(null); setInvoices([]) }}
              >
                Change
              </button>
            </div>

            <h2 className={styles.stepTitle}>Select Invoice</h2>

            {loadInv ? (
              <div className={styles.loadWrap}>
                <div className={styles.spinner}/>
                <p>Loading invoices…</p>
              </div>
            ) : invoices.length === 0 ? (
              <div className={`glass-card ${styles.emptyInv}`}>
                <p>No outstanding invoices for this student.</p>
              </div>
            ) : (
              <div className={styles.invList}>
                {invoices.map((inv, i) => (
                  <button
                    key={inv.id}
                    className={`glass-card ${styles.invBtn} animate-fade-up`}
                    style={{ animationDelay: `${i * 50}ms`, opacity: 0 }}
                    onClick={() => pickInvoice(inv)}
                  >
                    <div className={styles.invBtnBody}>
                      <span className={styles.invTerm}>{inv.term} · {inv.academic_year}</span>
                      <span className={styles.invDesc}>{inv.description}</span>
                      <div className={styles.invAmts}>
                        <span>Due: <strong>{fmtNGN(inv.amount_due_ngn)}</strong></span>
                        <span style={{ color: 'var(--success)' }}>
                          Paid: {fmtNGN(inv.amount_paid_ngn)}
                        </span>
                        <span style={{ color: 'var(--error)', fontWeight: 700 }}>
                          Bal: {fmtNGN(inv.balance_ngn)}
                        </span>
                      </div>
                    </div>
                    <svg
                      width="15" height="15" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                    >
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Payment Details */}
        {step === 3 && student && invoice && (
          <div className={`animate-fade-up ${styles.stepWrap}`}>
            <div className={styles.invSummary}>
              <p className={styles.invSumName}>{student.full_name} — {invoice.description}</p>
              <p className={styles.invSumBal}>
                Balance: <strong style={{ color: 'var(--error)' }}>{fmtNGN(invoice.balance_ngn)}</strong>
              </p>
            </div>

            <h2 className={styles.stepTitle}>Payment Details</h2>

            {/* Amount */}
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label}>Amount</label>
                <div className={styles.currToggle}>
                  {(['NGN', 'USD'] as Currency[]).map(c => (
                    <button
                      key={c}
                      className={`${styles.currBtn} ${currency === c ? styles.currBtnActive : ''}`}
                      onClick={() => {
                        if (c === currency) return
                        const v = parseFloat(amount)
                        if (!isNaN(v) && v > 0) {
                          setAmount(
                            c === 'USD'
                              ? (v / usdRate).toFixed(2)
                              : Math.round(v * usdRate).toString(),
                          )
                        }
                        setCurrency(c)
                      }}
                    >
                      {c === 'NGN' ? '₦ NGN' : '$ USD'}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.amtWrap}>
                <span className={styles.amtPfx}>{currency === 'NGN' ? '₦' : '$'}</span>
                <input
                  className={`input ${styles.amtInput}`}
                  type="number" min={0}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder={currency === 'NGN' ? '0' : '0.00'}
                />
              </div>
              {amountNGN > 0 && (
                <div className={styles.convRow}>
                  ≈ {currency === 'NGN' ? fmtUSD(amountNGN, usdRate) : fmtNGN(amountNGN)}
                  &nbsp;· Rate: ₦{usdRate.toLocaleString()}/$
                  {rateUpdatedAt && (
                    <span style={{ opacity: 0.6 }}>
                      &nbsp;(updated {new Date(rateUpdatedAt).toLocaleDateString('en-NG')})
                    </span>
                  )}
                </div>
              )}
              <div className={styles.quickFill}>
                {([[0.25, '25%'], [0.5, '50%'], [1, 'Full']] as [number, string][]).map(([p, l]) => (
                  <button
                    key={l}
                    className={styles.quickBtn}
                    onClick={() => {
                      const n = Math.round(invoice.balance_ngn * p)
                      setAmount(currency === 'NGN' ? String(n) : (n / usdRate).toFixed(2))
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {amountNGN > invoice.balance_ngn && (
                <p className={styles.fieldErr}>Exceeds balance ({fmtNGN(invoice.balance_ngn)})</p>
              )}
            </div>

            {/* Method */}
            <div className={styles.field}>
              <label className={styles.label}>Payment Method</label>
              <div className={styles.methodGrid}>
                {(['Cash', 'Bank Transfer', 'Card', 'Online'] as Method[]).map(m => (
                  <button
                    key={m}
                    className={`${styles.methodBtn} ${method === m ? styles.methodBtnActive : ''}`}
                    onClick={() => setMethod(m)}
                  >
                    <span>{METHOD_ICONS[m]}</span><span>{m}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference */}
            <div className={styles.field}>
              <label className={styles.label}>
                Reference <span className={styles.opt}>(optional)</span>
              </label>
              <input
                className="input"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder={method === 'Bank Transfer' ? 'e.g. TXN12345' : '—'}
              />
            </div>

            {/* Notes */}
            <div className={styles.field}>
              <label className={styles.label}>
                Notes <span className={styles.opt}>(optional)</span>
              </label>
              <textarea
                className={`input ${styles.textarea}`}
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional notes…"
              />
            </div>

            {submitErr && <div className={styles.formErr}>{submitErr}</div>}

            <button
              className={`btn btn-primary ${styles.submitBtn}`}
              onClick={handleSubmit}
              disabled={submitting || amountNGN <= 0 || amountNGN > invoice.balance_ngn}
            >
              {submitting
                ? <><span className={styles.spinnerSm}/>Recording…</>
                : <>Record · {fmtNGN(amountNGN)}</>}
            </button>
          </div>
        )}

        {/* STEP 4 — Receipt */}
        {step === 4 && receipt && student && invoice && (
          <div className={`animate-scale-in ${styles.stepWrap}`}>
            <div className={styles.rcpSuccess}>
              <div className={styles.rcpSuccessIcon}>
                <svg
                  width="30" height="30" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className={styles.rcpTitle}>Payment Recorded</h2>
              <p className={styles.rcpSub}>Receipt generated</p>
            </div>

            <div className={`glass-card ${styles.rcpCard}`}>
              <div className={styles.rcpHeader}>
                <p className={styles.rcpSchool}>{schoolInfo.school_name}</p>
                <p className={styles.rcpNo}>{receipt.receiptNumber}</p>
              </div>
              <div className={styles.rcpRows}>
                {[
                  ['Student',      student.full_name],
                  ['Admission No.', student.admission_number],
                  ['Invoice',      invoice.description],
                  ['Term',         invoice.term],
                  ['Amount Paid',  fmtNGN(amountNGN)],
                  ['USD Equiv',    fmtUSD(amountNGN, usdRate)],
                  ['Method',       method],
                  ['Reference',    reference || '—'],
                  ['Date',         new Date().toLocaleString('en-NG')],
                  ['New Balance',  fmtNGN(Math.max(0, invoice.balance_ngn - amountNGN))],
                ].map(([l, v]) => (
                  <div key={l} className={styles.rcpRow}>
                    <span className={styles.rcpLbl}>{l}</span>
                    <span className={styles.rcpVal}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.rcpActions}>
              <button className="btn btn-primary" onClick={handlePrint} style={{ flex: 1 }}>
                <svg
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Print Receipt
              </button>
              {receipt.pdfUrl && (
                <a
                  href={receipt.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                >
                  Download PDF
                </a>
              )}
              <button className="btn btn-ghost" onClick={handleNew} style={{ flex: 1 }}>
                New Payment
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )

  return (
    <RolePageWrapper
      userId={userId}
      role="bursar"
      profile={profile}
      school={school}
      title="Record Payment"
      showBack={step > 1}
    >
      {wizardContent}
    </RolePageWrapper>
  )
}
