'use client'
// src/app/dashboard/parent/fees/FeesClient.tsx
//
// Parent-facing fee overview. Shows, per linked child:
//   - balance owed (from payment_invoices — the live source of truth)
//   - payment history / receipts (from payments, joined through
//     payment_invoices -> fee_structures, same chain bursar's ReceiptsClient uses)
//   - reminders sent by the bursar (from fee_reminders)
//
// Supports parents with more than one linked child (profiles.parent_id is
// not unique per parent) via a child switcher, instead of assuming .single().

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  WalletIcon, FileTextIcon, BellIcon, UploadIcon,
  XIcon, CameraIcon, ImageIcon,
} from '@/components/Icons'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

type Tab = 'overview' | 'receipts' | 'submit' | 'reminders'

const TERMS     = ['First Term', 'Second Term', 'Third Term']
const FEE_TYPES = ['school_fees','development_levy','pta','uniform','exam','other']
const CUR_YEAR  = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

const TERM_KEY_MAP: Record<string, string> = {
  'First Term': 'first', 'Second Term': 'second', 'Third Term': 'third',
}
const TERM_LABELS: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  paid:     { label: 'Paid',     color: '#10B981', bg: '#10B98115' },
  partial:  { label: 'Partial',  color: '#F59E0B', bg: '#F59E0B15' },
  pending:  { label: 'Pending',  color: '#F59E0B', bg: '#F59E0B15' },
  overdue:  { label: 'Overdue',  color: '#EF4444', bg: '#EF444415' },
}
const CLAIM_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending Review', color: '#F59E0B', bg: '#F59E0B15' },
  confirmed: { label: 'Confirmed',      color: '#10B981', bg: '#10B98115' },
  rejected:  { label: 'Rejected',       color: '#EF4444', bg: '#EF444415' },
}

export default function FeesClient({ profile, school, userId }: Props) {
  const [children, setChildren] = useState<any[]>([])
  const [childId,  setChildId]  = useState<string | null>(null)
  const [tab,      setTab]      = useState<Tab>('overview')
  const [term,     setTerm]     = useState('First Term')
  const [year,     setYear]     = useState(CUR_YEAR)

  const [loading,  setLoading]  = useState(true)
  const [invoices, setInvoices] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [reminders,setReminders]= useState<any[]>([])
  const [claims,   setClaims]   = useState<any[]>([])
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null)
  const [error,    setError]    = useState('')
  const [toast,    setToast]    = useState('')

  // Submit-payment form state
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [claimTerm,    setClaimTerm]    = useState('First Term')
  const [claimYear,    setClaimYear]    = useState(CUR_YEAR)
  const [feeType,     setFeeType]     = useState('school_fees')
  const [claimAmount, setClaimAmount] = useState('')
  const [bankUsed,    setBankUsed]    = useState('')
  const [payDate,     setPayDate]     = useState('')
  const [notes,       setNotes]       = useState('')
  const [proofFile,   setProofFile]   = useState<File | null>(null)
  const [proofPreview,setProofPreview]= useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'
  const child = children.find(c => c.id === childId) ?? null

  useEffect(() => { loadChildren() }, [])
  useEffect(() => { if (childId) loadAll(childId) }, [childId, term, year])

  async function loadChildren() {
    setLoading(true)
    setError('')
    // A parent can have more than one linked child — never assume .single()
    const { data: childData, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, class_level')
      .eq('parent_id', userId)
      .order('full_name')

    if (err) { setError(err.message); setLoading(false); return }

    if (!childData || childData.length === 0) {
      setChildren([])
      setLoading(false)
      return
    }

    setChildren(childData)
    setChildId(childData[0].id)
    await detectActiveTermYear(childData[0].id)
    // loadAll fires via the childId/term/year effect once childId is set
  }

  // Instead of guessing the "current" term from the calendar (terms are set
  // by the school, not derived from the date), find the most recently
  // created invoice for this child and default the view to that term/year.
  // Falls back to First Term / CUR_YEAR if the child has no invoices yet.
  async function detectActiveTermYear(id: string) {
    const { data } = await supabase
      .from('payment_invoices')
      .select('fee_structures ( term, academic_year ), created_at')
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(1)

    const latest = data?.[0]
    const fs = latest ? unwrapEmbed((latest as any).fee_structures) : null
    if (fs?.term) {
      setTerm(TERM_LABELS[fs.term] ?? 'First Term')
      setYear(fs.academic_year ?? CUR_YEAR)
    }
  }

  async function loadAll(id: string) {
    setLoading(true)
    setError('')
    const termKey = TERM_KEY_MAP[term] ?? 'first'

    // ── Balance owed: payment_invoices is the live source of truth ──
    const { data: invData, error: invErr } = await supabase
      .from('payment_invoices')
      .select(`
        id, amount_due_ngn, amount_paid_ngn, balance_ngn, status,
        fee_structures ( description, term, academic_year )
      `)
      .eq('student_id', id)

    if (invErr) {
      setError(invErr.message)
      setInvoices([]); setPayments([]); setReminders([])
      setLoading(false)
      return
    }

    // Re-verify term/year client-side — PostgREST does not reliably apply
    // filters on a 2nd-level nested embed (payment_invoices -> fee_structures).
    const filteredInv = (invData ?? []).filter((inv: any) => {
      const fs = unwrapEmbed(inv.fee_structures)
      return fs && fs.term === termKey && fs.academic_year === year
    })
    setInvoices(filteredInv)

    // ── Receipts: payments (own student_id, school_id) -> payment_invoices -> fee_structures ──
    const { data: payData, error: payErr } = await supabase
      .from('payments')
      .select(`
        id, receipt_number, payment_method, payment_reference, notes,
        paid_at, created_at, amount_paid_ngn, amount_paid_usd, currency_used,
        payment_invoices (
          fee_structures ( description, term, academic_year )
        )
      `)
      .eq('student_id', id)
      .eq('payment_invoices.fee_structures.term', termKey)
      .eq('payment_invoices.fee_structures.academic_year', year)
      .order('created_at', { ascending: false })
      .limit(50)

    if (payErr) {
      setError(payErr.message)
      setPayments([])
    } else {
      // .eq() filters above target a 2nd-level nested embed
      // (payments -> payment_invoices -> fee_structures). PostgREST does not
      // reliably apply filters at that depth in all versions, so we ALSO
      // verify term/year client-side rather than trusting the server filter alone.
      const filteredPay = (payData ?? []).filter((row: any) => {
        const inv = unwrapEmbed(row.payment_invoices)
        const fs = unwrapEmbed(inv?.fee_structures)
        return fs && fs.term === termKey && fs.academic_year === year
      })
      setPayments(filteredPay)
    }

    // ── Reminders sent by the bursar for this child ──
    const { data: remData, error: remErr } = await supabase
      .from('fee_reminders')
      .select(`
        id, channel, status, message_body, sent_at, created_at,
        payment_invoices ( student_id )
      `)
      .eq('parent_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (remErr) {
      setReminders([])
    } else {
      const filteredRem = (remData ?? []).filter((row: any) => {
        const inv = unwrapEmbed(row.payment_invoices)
        return inv && inv.student_id === id
      })
      setReminders(filteredRem)
    }

    // ── This child's submitted payment claims awaiting/after bursar review ──
    const { data: claimData, error: claimErr } = await supabase
      .from('payment_claims')
      .select('*')
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(30)

    setClaims(claimErr ? [] : (claimData ?? []))

    setLoading(false)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setProofFile(f)
    const reader = new FileReader()
    reader.onload = ev => setProofPreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  function resetForm() {
    setClaimAmount(''); setBankUsed(''); setPayDate(''); setNotes('')
    setProofFile(null); setProofPreview(null)
    setClaimTerm('First Term'); setClaimYear(CUR_YEAR); setFeeType('school_fees')
    if (fileRef.current) fileRef.current.value = ''
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  async function handleSubmitClaim() {
    if (!child || !claimAmount || !proofFile) {
      showToast('Please fill amount and upload payment proof')
      return
    }
    setSaving(true)
    try {
      const ext  = proofFile.name.split('.').pop() ?? 'jpg'
      const path = `payment-proofs/${school.id}/${child.id}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('school-files')
        .upload(path, proofFile, { upsert: false, contentType: proofFile.type })

      if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

      const { data: urlData } = supabase.storage
        .from('school-files')
        .getPublicUrl(path)

      const proofUrl = urlData?.publicUrl ?? null

      const { error: claimErr } = await supabase.from('payment_claims').insert({
        school_id:      school.id,
        parent_id:      userId,
        student_id:     child.id,
        fee_type:       feeType,
        term:           claimTerm,
        academic_year:  claimYear,
        amount_claimed: parseFloat(claimAmount),
        bank_used:      bankUsed.trim() || null,
        payment_date:   payDate || null,
        notes:          notes.trim() || null,
        proof_url:      proofUrl,
        status:         'pending',
      })

      if (claimErr) throw new Error(claimErr.message)

      await fetch('/api/payments/claim-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id:    school.id,
          student_name: child.full_name,
          amount:       parseFloat(claimAmount),
          term:         claimTerm,
          year:         claimYear,
          fee_type:     feeType,
        }),
      })

      showToast('Payment claim submitted! Awaiting bursar confirmation.')
      setShowForm(false)
      resetForm()
      if (childId) loadAll(childId)
    } catch (err: any) {
      showToast(err.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }


  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
    }).format(n ?? 0)
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }

  function flattenPayment(row: any) {
    const inv = unwrapEmbed(row.payment_invoices)
    const fs  = unwrapEmbed(inv?.fee_structures)
    return {
      id:             row.id,
      receipt_number: row.receipt_number,
      fee_type:       fs?.description ?? 'School Fees',
      term:           TERM_LABELS[fs?.term] ?? fs?.term ?? '',
      academic_year:  fs?.academic_year ?? '',
      payment_method: row.payment_method,
      reference:      row.payment_reference,
      notes:          row.notes,
      created_at:     row.paid_at ?? row.created_at,
      amount:         row.currency_used === 'USD' ? row.amount_paid_usd : row.amount_paid_ngn,
      currency:       row.currency_used,
    }
  }

  function downloadReceipt(r: any) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Receipt ${r.receipt_number}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 480px; margin: 40px auto; color: #111; }
    h1   { font-size: 1.1rem; margin: 0 0 2px; color: ${sc}; }
    .sub { font-size: 0.75rem; color: #666; margin: 0 0 16px; }
    .badge { display:inline-block; background:${sc}18; color:${sc}; font-weight:700;
             font-size:0.8rem; padding:4px 10px; border-radius:6px; margin-bottom:20px; }
    table { width:100%; border-collapse:collapse; margin-bottom:20px; }
    td    { padding:9px 0; border-bottom:1px solid #eee; font-size:0.85rem; }
    td:last-child { text-align:right; font-weight:700; }
    .amount-row td { font-size:1.1rem; font-weight:800; border-bottom:none; padding-top:16px; }
    .amount-row td:last-child { color:#10B981; }
    @media print { body { margin:20px; } }
  </style>
</head>
<body>
  <h1>${school?.name ?? 'School'}</h1>
  ${school?.address ? `<p class="sub">${school.address}</p>` : ''}
  <p class="sub" style="font-weight:800;letter-spacing:.08em;font-size:.7rem;margin-bottom:4px">PAYMENT RECEIPT</p>
  <p class="badge">${r.receipt_number}</p>
  <table>
    <tr><td>Student</td><td>${child?.full_name ?? ''}</td></tr>
    ${child?.class_level ? `<tr><td>Class</td><td>${child.class_level}</td></tr>` : ''}
    <tr><td>Fee Type</td><td style="text-transform:capitalize">${r.fee_type?.replace(/_/g,' ') ?? ''}</td></tr>
    <tr><td>Term</td><td>${r.term}</td></tr>
    <tr><td>Academic Year</td><td>${r.academic_year}</td></tr>
    <tr><td>Payment Method</td><td style="text-transform:capitalize">${r.payment_method?.replace(/_/g,' ') ?? ''}</td></tr>
    ${r.reference ? `<tr><td>Reference / Teller</td><td>${r.reference}</td></tr>` : ''}
    <tr><td>Date</td><td>${fmtDate(r.created_at)}</td></tr>
    <tr class="amount-row"><td>Amount Paid</td><td>${fmtAmt(r.amount)}</td></tr>
  </table>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.target   = '_blank'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  // ── Aggregate owed/paid across this child's invoices for the selected term ──
  const totalDue  = invoices.reduce((s, r) => s + (r.amount_due_ngn ?? 0), 0)
  const totalPaid = invoices.reduce((s, r) => s + (r.amount_paid_ngn ?? 0), 0)
  const totalOwed = invoices.reduce((s, r) => s + (r.balance_ngn ?? 0), 0)

  const flatPayments = payments.map(flattenPayment)
  const unreadReminderCount = reminders.filter(r => r.status === 'sent').length

  const inp: React.CSSProperties = {
    height: 40, padding: '0 12px', background: 'var(--input-bg)',
    border: '1px solid var(--input-border)', borderRadius: 8,
    color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
  }

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Fee Status">

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:80, left:'50%', transform:'translateX(-50%)',
          background:'#1a1a2e', color:'#fff', padding:'10px 20px', borderRadius:10,
          fontSize:'0.82rem', zIndex:999, boxShadow:'0 4px 20px #0008', maxWidth:'90vw',
          textAlign:'center', border:'1px solid var(--glass-border)' }}>
          {toast}
        </div>
      )}

      {/* Receipt preview modal */}
      {selectedReceipt && (
        <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.65)',
          backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setSelectedReceipt(null)}>
          <div style={{ width:'100%', maxWidth:520, background:'var(--glass-bg)',
            border:'1px solid var(--glass-border)', borderRadius:'18px 18px 0 0',
            padding:'20px 20px 36px', maxHeight:'90vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto 18px' }}/>
            <div style={{ textAlign:'center', borderBottom:'1px solid var(--glass-border)', paddingBottom:14, marginBottom:14 }}>
              <p style={{ fontSize:'1rem', fontWeight:800, color:sc, margin:'0 0 2px' }}>{school?.name}</p>
              <p style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.12em', color:'var(--text-muted)', margin:'0 0 4px' }}>
                PAYMENT RECEIPT
              </p>
              <p style={{ fontSize:'0.9rem', fontWeight:800, color:sc, margin:0 }}>{selectedReceipt.receipt_number}</p>
            </div>
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <p style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.07em', margin:'0 0 4px' }}>
                AMOUNT PAID
              </p>
              <p style={{ fontSize:'2rem', fontWeight:900, color:'#10B981', margin:0 }}>
                {fmtAmt(selectedReceipt.amount)}
              </p>
            </div>
            {([
              ['Student',        child?.full_name ?? '—'],
              ['Class',          child?.class_level ?? '—'],
              ['Fee Type',       selectedReceipt.fee_type?.replace(/_/g,' ')],
              ['Term',           selectedReceipt.term || '—'],
              ['Academic Year',  selectedReceipt.academic_year || '—'],
              ['Payment Method', selectedReceipt.payment_method?.replace(/_/g,' ')],
              selectedReceipt.reference ? ['Reference / Teller', selectedReceipt.reference] : null,
              ['Date',           fmtDate(selectedReceipt.created_at)],
            ] as any[]).filter(Boolean).map(([label, value]: [string, string]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid var(--glass-border)' }}>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:600 }}>{label}</span>
                <span style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-primary)', textTransform:'capitalize', textAlign:'right', maxWidth:'60%' }}>{value}</span>
              </div>
            ))}
            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button onClick={() => downloadReceipt(selectedReceipt)}
                style={{ flex:2, height:44, background:sc, color:'#fff', border:'none', borderRadius:10, fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
                ↓ Download / Print
              </button>
              <button onClick={() => setSelectedReceipt(null)}
                style={{ flex:1, height:44, background:'var(--input-bg)', color:'var(--text-primary)', border:'1px solid var(--input-border)', borderRadius:10, fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* School payment account details */}
      {(school?.bank_name || school?.account_number) && (
        <div style={{ background:'var(--glass-bg)', border:`1px solid ${sc}40`, borderRadius:12,
          padding:'14px 16px', marginBottom:'var(--space-4)' }}>
          <p style={{ fontSize:'0.68rem', fontWeight:800, color:'var(--text-muted)', letterSpacing:'0.06em', margin:'0 0 8px' }}>
            SCHOOL PAYMENT ACCOUNT
          </p>
          <p style={{ fontSize:'0.9rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 2px' }}>
            {school.account_name ?? school.name}
          </p>
          <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', margin:0 }}>
            {school.bank_name} · <strong style={{ color:sc }}>{school.account_number}</strong>
          </p>
          <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:6 }}>
            Use your child's name as payment reference
          </p>
        </div>
      )}

      {loading && children.length === 0
        ? <div className={styles.loading}><span/><span/><span/></div>
        : children.length === 0
          ? <div className={styles.empty}>
              <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              {/* Child switcher — only shown when parent has more than one linked child */}
              {children.length > 1 && (
                <div style={{ display:'flex', gap:8, marginBottom:'var(--space-4)', overflowX:'auto' }}>
                  {children.map(c => (
                    <button key={c.id} onClick={() => setChildId(c.id)}
                      style={{
                        flexShrink:0, padding:'8px 16px', borderRadius:20, fontWeight:700,
                        fontSize:'0.82rem', cursor:'pointer', border:'1px solid var(--glass-border)',
                        background: c.id === childId ? sc : 'var(--input-bg)',
                        color: c.id === childId ? '#fff' : 'var(--text-muted)',
                      }}>
                      {c.full_name?.split(' ')[0] ?? 'Child'}
                    </button>
                  ))}
                </div>
              )}

              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Fee records for <strong style={{ color:'var(--text-primary)' }}>{child?.full_name}</strong> · {child?.class_level}
              </p>

              {/* Term + Year selector */}
              <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', alignItems:'center' }}>
                <input value={year} onChange={e => setYear(e.target.value)} placeholder="2025/2026"
                  style={{ ...inp, width:110, flexShrink:0 }}/>
                <div className={styles.tabs} style={{ flex:1 }}>
                  {TERMS.map(t => (
                    <button key={t} onClick={() => setTerm(t)}
                      className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
                      style={term===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
                      {t.replace(' Term','')}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ padding:'10px 14px', background:'#EF444415', border:'1px solid #EF444440',
                  borderRadius:8, marginBottom:'var(--space-4)', fontSize:'0.8rem', color:'#EF4444', fontWeight:600 }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Sub-tabs */}
              <div className={styles.tabs} style={{ marginBottom:'var(--space-4)' }}>
                {([
                  ['overview', '💰 Overview'],
                  ['receipts', `🧾 Receipts${flatPayments.length ? ` (${flatPayments.length})` : ''}`],
                  ['submit', `📤 Submit Payment${claims.filter(c=>c.status==='pending').length ? ` (${claims.filter(c=>c.status==='pending').length})` : ''}`],
                  ['reminders', `🔔 Reminders${unreadReminderCount ? ` (${unreadReminderCount})` : ''}`],
                ] as [Tab, string][]).map(([t, label]) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`${styles.tab} ${tab===t ? styles.tabActive : ''}`}
                    style={tab===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
                    {label}
                  </button>
                ))}
              </div>

              {loading
                ? <div className={styles.loading}><span/><span/><span/></div>
                : <>
                    {/* ── OVERVIEW TAB: balance owed ── */}
                    {tab === 'overview' && (
                      invoices.length === 0
                        ? <div className={styles.empty}>
                            <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                            <p>No fee structure set for {term} {year} yet.</p>
                          </div>
                        : <>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)', marginBottom:'var(--space-4)' }}>
                              <div style={{ background:sc+'15', border:`1px solid ${sc}30`, borderRadius:12, padding:'14px 16px' }}>
                                <p style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.05em', margin:'0 0 4px' }}>
                                  TOTAL EXPECTED
                                </p>
                                <p style={{ fontSize:'1.05rem', fontWeight:800, color:sc, margin:0 }}>
                                  {fmtAmt(totalDue)}
                                </p>
                              </div>
                              <div style={{ background: totalOwed > 0 ? '#EF444415' : '#10B98115',
                                border:`1px solid ${totalOwed > 0 ? '#EF4444' : '#10B981'}30`, borderRadius:12, padding:'14px 16px' }}>
                                <p style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.05em', margin:'0 0 4px' }}>
                                  BALANCE OWED
                                </p>
                                <p style={{ fontSize:'1.05rem', fontWeight:800, color: totalOwed > 0 ? '#EF4444' : '#10B981', margin:0 }}>
                                  {totalOwed > 0 ? fmtAmt(totalOwed) : '✓ Cleared'}
                                </p>
                              </div>
                            </div>

                            <div style={{ background:'#10B98112', border:'1px solid #10B98130', borderRadius:10,
                              padding:'10px 16px', marginBottom:'var(--space-4)', display:'flex', justifyContent:'space-between' }}>
                              <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)', fontWeight:600 }}>Total Paid</span>
                              <span style={{ fontSize:'0.9rem', fontWeight:800, color:'#10B981' }}>{fmtAmt(totalPaid)}</span>
                            </div>

                            <p style={{ fontSize:'0.72rem', fontWeight:800, color:'var(--text-muted)', letterSpacing:'0.05em', margin:'0 0 var(--space-3)' }}>
                              FEE BREAKDOWN
                            </p>
                            <div className={styles.list}>
                              {invoices.map((inv: any) => {
                                const fs = unwrapEmbed(inv.fee_structures)
                                const meta = STATUS_META[inv.status] ?? STATUS_META.pending
                                return (
                                  <div key={inv.id} className={styles.card}>
                                    <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                                      <WalletIcon size={16} color={sc}/>
                                    </div>
                                    <div className={styles.cardBody}>
                                      <p className={styles.cardTitle} style={{ textTransform:'capitalize' }}>
                                        {fs?.description?.replace(/_/g,' ') ?? 'Fee'}
                                      </p>
                                      <p className={styles.cardMeta}>
                                        Paid {fmtAmt(inv.amount_paid_ngn)} of {fmtAmt(inv.amount_due_ngn)}
                                      </p>
                                    </div>
                                    <span style={{ fontSize:'0.7rem', fontWeight:800, color:meta.color,
                                      background:meta.bg, padding:'3px 10px', borderRadius:20, flexShrink:0 }}>
                                      {meta.label}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>

                            {totalOwed > 0 && (
                              <button onClick={() => { setTab('submit'); setShowForm(true) }}
                                style={{ width:'100%', height:46, background:sc, color:'#fff',
                                  border:'none', borderRadius:10, fontWeight:700, fontSize:'0.88rem',
                                  cursor:'pointer', marginTop:'var(--space-4)', display:'flex',
                                  alignItems:'center', justifyContent:'center', gap:8 }}>
                                <UploadIcon size={16} color="#fff"/>
                                I Have Made Payment
                              </button>
                            )}
                          </>
                    )}

                    {/* ── RECEIPTS TAB ── */}
                    {tab === 'receipts' && (
                      flatPayments.length === 0
                        ? <div className={styles.empty}>
                            <FileTextIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                            <p>No receipts for {term} {year}</p>
                          </div>
                        : <div className={styles.list}>
                            {flatPayments.map((p: any) => (
                              <div key={p.id} className={styles.card} style={{ cursor:'pointer' }}
                                onClick={() => setSelectedReceipt(p)}>
                                <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                                  <FileTextIcon size={16} color={sc}/>
                                </div>
                                <div className={styles.cardBody}>
                                  <p className={styles.cardTitle}>{p.receipt_number}</p>
                                  <p className={styles.cardMeta} style={{ textTransform:'capitalize' }}>
                                    {p.fee_type?.replace(/_/g,' ')}
                                  </p>
                                </div>
                                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                                  <p style={{ fontSize:'0.88rem', fontWeight:800, color:'#10B981', margin:0 }}>
                                    {fmtAmt(p.amount)}
                                  </p>
                                  <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>
                                    {fmtShort(p.created_at)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                    )}

                    {/* ── SUBMIT PAYMENT TAB ── */}
                    {tab === 'submit' && (
                      <>
                        {!showForm && (
                          <button onClick={() => setShowForm(true)}
                            style={{ width:'100%', height:46, background:sc, color:'#fff',
                              border:'none', borderRadius:10, fontWeight:700, fontSize:'0.88rem',
                              cursor:'pointer', marginBottom:'var(--space-5)', display:'flex',
                              alignItems:'center', justifyContent:'center', gap:8 }}>
                            <UploadIcon size={16} color="#fff"/>
                            I Have Made Payment
                          </button>
                        )}

                        {showForm && (
                          <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
                            borderRadius:14, padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
                            <p style={{ fontSize:'0.88rem', fontWeight:800, color:'var(--text-primary)',
                              margin:'0 0 var(--space-4)' }}>Submit Payment Proof</p>

                            <div style={{ display:'grid', gap:'var(--space-3)' }}>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                                <select value={claimTerm} onChange={e => setClaimTerm(e.target.value)} style={inp}>
                                  {TERMS.map(t => <option key={t}>{t}</option>)}
                                </select>
                                <input value={claimYear} onChange={e => setClaimYear(e.target.value)}
                                  placeholder="2024/2025" style={inp}/>
                              </div>

                              <select value={feeType} onChange={e => setFeeType(e.target.value)} style={inp}>
                                {FEE_TYPES.map(f => (
                                  <option key={f} value={f} style={{ textTransform:'capitalize' }}>
                                    {f.replace(/_/g,' ')}
                                  </option>
                                ))}
                              </select>

                              <div>
                                <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:700,
                                  letterSpacing:'0.05em', display:'block', marginBottom:5 }}>
                                  AMOUNT YOU PAID (₦) *
                                </label>
                                <input type="number" placeholder="e.g. 45000" value={claimAmount}
                                  onChange={e => setClaimAmount(e.target.value)} style={inp}/>
                              </div>

                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                                <input placeholder="Bank used (e.g. GTBank)" value={bankUsed}
                                  onChange={e => setBankUsed(e.target.value)} style={inp}/>
                                <input type="date" value={payDate}
                                  onChange={e => setPayDate(e.target.value)} style={inp}/>
                              </div>

                              <input placeholder="Notes (optional)" value={notes}
                                onChange={e => setNotes(e.target.value)} style={inp}/>

                              <div>
                                <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:700,
                                  letterSpacing:'0.05em', display:'block', marginBottom:8 }}>
                                  PAYMENT SCREENSHOT / RECEIPT *
                                </label>
                                <input ref={fileRef} type="file"
                                  accept="image/*,application/pdf"
                                  onChange={onFileChange}
                                  style={{ display:'none' }}/>

                                {!proofPreview
                                  ? <button onClick={() => fileRef.current?.click()}
                                      style={{ width:'100%', height:100, border:'2px dashed var(--input-border)',
                                        borderRadius:10, background:'var(--input-bg)', cursor:'pointer',
                                        display:'flex', flexDirection:'column', alignItems:'center',
                                        justifyContent:'center', gap:8, color:'var(--text-muted)' }}>
                                      <CameraIcon size={24} color="var(--text-muted)"/>
                                      <span style={{ fontSize:'0.78rem', fontWeight:600 }}>
                                        Tap to upload screenshot or photo
                                      </span>
                                    </button>
                                  : <div style={{ position:'relative' }}>
                                      <img src={proofPreview} alt="proof"
                                        style={{ width:'100%', maxHeight:200, objectFit:'contain',
                                          borderRadius:10, border:'1px solid var(--glass-border)' }}/>
                                      <button onClick={() => { setProofFile(null); setProofPreview(null) }}
                                        style={{ position:'absolute', top:6, right:6, background:'#EF4444',
                                          border:'none', borderRadius:'50%', width:26, height:26,
                                          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                        <XIcon size={13} color="#fff"/>
                                      </button>
                                    </div>
                                }
                              </div>
                            </div>

                            <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
                              <button onClick={handleSubmitClaim}
                                disabled={saving || !claimAmount || !proofFile}
                                style={{ flex:1, height:44, background:sc, color:'#fff', border:'none',
                                  borderRadius:9, fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                                  opacity: (saving || !claimAmount || !proofFile) ? 0.5 : 1 }}>
                                {saving ? 'Submitting…' : 'Submit for Confirmation'}
                              </button>
                              <button onClick={() => { setShowForm(false); resetForm() }}
                                style={{ padding:'0 18px', height:44, background:'var(--input-bg)',
                                  color:'var(--text-muted)', border:'1px solid var(--input-border)',
                                  borderRadius:9, fontWeight:700, cursor:'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {claims.length === 0
                          ? <div className={styles.empty}>
                              <UploadIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                              <p>No payment claims submitted yet.</p>
                            </div>
                          : <>
                              <p style={{ fontSize:'0.72rem', fontWeight:800, color:'var(--text-muted)',
                                letterSpacing:'0.05em', margin:'0 0 var(--space-3)' }}>
                                YOUR PAYMENT CLAIMS
                              </p>
                              <div className={styles.list}>
                                {claims.map((c: any) => {
                                  const meta = CLAIM_STATUS_META[c.status] ?? CLAIM_STATUS_META.pending
                                  return (
                                    <div key={c.id} className={styles.card} style={{ flexDirection:'column', alignItems:'flex-start', gap:10 }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', width:'100%', alignItems:'center' }}>
                                        <div>
                                          <p className={styles.cardTitle} style={{ marginBottom:2 }}>
                                            {c.fee_type?.replace(/_/g,' ')} — {c.term} {c.academic_year}
                                          </p>
                                          <p className={styles.cardMeta}>
                                            {fmtAmt(c.amount_claimed)}
                                            {c.bank_used ? ` · ${c.bank_used}` : ''}
                                            {c.payment_date ? ` · ${new Date(c.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}` : ''}
                                          </p>
                                        </div>
                                        <span style={{ fontSize:'0.72rem', fontWeight:800, color:meta.color,
                                          background:meta.bg, padding:'3px 10px', borderRadius:20, flexShrink:0 }}>
                                          {meta.label}
                                        </span>
                                      </div>
                                      {c.proof_url && (
                                        <a href={c.proof_url} target="_blank" rel="noopener noreferrer"
                                          style={{ display:'flex', alignItems:'center', gap:6,
                                            fontSize:'0.75rem', color:sc, fontWeight:600, textDecoration:'none' }}>
                                          <ImageIcon size={14} color={sc}/>
                                          View proof screenshot
                                        </a>
                                      )}
                                      {c.status === 'rejected' && c.bursar_note && (
                                        <div style={{ background:'#EF444415', border:'1px solid #EF444430',
                                          borderRadius:8, padding:'8px 12px', width:'100%' }}>
                                          <p style={{ fontSize:'0.75rem', color:'#EF4444', margin:0, fontWeight:600 }}>
                                            Reason: {c.bursar_note}
                                          </p>
                                        </div>
                                      )}
                                      {c.status === 'confirmed' && (
                                        <div style={{ background:'#10B98115', border:'1px solid #10B98130',
                                          borderRadius:8, padding:'8px 12px', width:'100%' }}>
                                          <p style={{ fontSize:'0.75rem', color:'#10B981', margin:0, fontWeight:600 }}>
                                            ✓ Payment confirmed. See Receipts tab.
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </>
                        }
                      </>
                    )}

                    {/* ── REMINDERS TAB ── */}
                    {tab === 'reminders' && (
                      reminders.length === 0
                        ? <div className={styles.empty}>
                            <BellIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                            <p>No reminders from the school yet.</p>
                          </div>
                        : <div className={styles.list}>
                            {reminders.map((r: any) => (
                              <div key={r.id} className={styles.card}
                                style={{ flexDirection:'column', alignItems:'flex-start', gap:8 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', width:'100%', alignItems:'center' }}>
                                  <p className={styles.cardTitle} style={{ margin:0 }}>
                                    {fmtShort(r.sent_at ?? r.created_at)}
                                  </p>
                                  <span style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)',
                                    background:'var(--input-bg)', padding:'2px 8px', borderRadius:20 }}>
                                    {r.channel === 'in_app' ? 'In-App' : r.channel?.toUpperCase()}
                                  </span>
                                </div>
                                <p style={{ fontSize:'0.8rem', color:'var(--text-primary)', lineHeight:1.6, margin:0, whiteSpace:'pre-wrap' }}>
                                  {r.message_body}
                                </p>
                              </div>
                            ))}
                          </div>
                    )}
                  </>
              }
            </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
