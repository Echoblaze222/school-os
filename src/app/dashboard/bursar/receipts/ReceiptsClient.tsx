'use client'
// src/app/dashboard/bursar/receipts/ReceiptsClient.tsx
//
// Fixed: was reading from `fee_payments`, a table nothing writes to anymore.
// RecordPaymentClient now writes to `payments` (linked via invoice_id to
// payment_invoices -> fee_structures, and to profiles via student_id).
// This rewrite joins through that real chain so receipts actually appear.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { FileTextIcon } from '@/components/Icons'
import { getCurrentAcademicYear, getCurrentTerm } from '@/lib/utils/term'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = getCurrentAcademicYear()

const TERM_KEY_MAP: Record<string, string> = {
  'First Term': 'first', 'Second Term': 'second', 'Third Term': 'third',
}
const TERM_LABELS: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}

/** Flattens a payments row + its nested joins into the flat shape the UI expects */
function flatten(row: any) {
  const inv     = row.payment_invoices
  const fs      = inv?.fee_structures
  const student = row['profiles!student_id']
  return {
    id:             row.id,
    receipt_number: row.receipt_number,
    student_name:   student?.full_name ?? 'Unknown',
    class_level:    student?.class_level ?? '',
    fee_type:       fs?.description ?? 'School Fees',
    term:           TERM_LABELS[fs?.term] ?? fs?.term ?? '',
    academic_year:  fs?.academic_year ?? '',
    payment_method: row.payment_method,
    reference:      row.payment_reference,
    notes:          row.notes,
    created_at:      row.paid_at ?? row.created_at,
    amount:         row.currency_used === 'USD' ? row.amount_paid_usd : row.amount_paid_ngn,
    currency:       row.currency_used,
  }
}

export default function ReceiptsClient({ profile, school, userId }: Props) {
  const [payments, setPayments] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [term,     setTerm]     = useState(getCurrentTerm())
  const [year,     setYear]     = useState(CUR_YEAR)
  const [error,    setError]    = useState('')
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term, year])

  async function load() {
    setLoading(true)
    setError('')
    const termKey = TERM_KEY_MAP[term] ?? 'first'

    const { data, error: err } = await supabase
      .from('payments')
      .select(`
        id, receipt_number, payment_method, payment_reference, notes,
        paid_at, created_at, amount_paid_ngn, amount_paid_usd, currency_used,
        payment_invoices (
          fee_structures ( description, term, academic_year )
        ),
        profiles!student_id ( full_name, class_level )
      `)
      .eq('school_id', school?.id)
      .eq('payment_invoices.fee_structures.term', termKey)
      .eq('payment_invoices.fee_structures.academic_year', year)
      .order('created_at', { ascending: false })
      .limit(200)

    if (err) {
      setError(err.message)
      setPayments([])
      setLoading(false)
      return
    }

    // The .eq() filters above target a 2nd-level nested embed
    // (payments -> payment_invoices -> fee_structures). PostgREST does not
    // reliably apply filters at that depth in all versions, so we ALSO
    // verify the match client-side rather than trusting the server filter alone.
    const flattened = (data ?? [])
      .filter((row: any) => {
        const fs = row.payment_invoices?.fee_structures
        return fs && fs.term === termKey && fs.academic_year === year
      })
      .map(flatten)

    setPayments(flattened)
    setLoading(false)
  }

  function fmtAmt(n: number, currency: string = 'NGN') {
    if (currency === 'USD') {
      return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n ?? 0)
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }

  // ── PDF download ──────────────────────────────────────────
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
    .bank { background:#f7f7f7; padding:12px; border-radius:8px; font-size:0.78rem; }
    .bank strong { display:block; margin-bottom:2px; }
    @media print { body { margin:20px; } }
  </style>
</head>
<body>
  <h1>${school?.name ?? 'School'}</h1>
  ${school?.address ? `<p class="sub">${school.address}</p>` : ''}
  <p class="sub" style="font-weight:800;letter-spacing:.08em;font-size:.7rem;margin-bottom:4px">PAYMENT RECEIPT</p>
  <p class="badge">${r.receipt_number}</p>
  <table>
    <tr><td>Student</td><td>${r.student_name}</td></tr>
    ${r.class_level ? `<tr><td>Class</td><td>${r.class_level}</td></tr>` : ''}
    <tr><td>Fee Type</td><td style="text-transform:capitalize">${r.fee_type?.replace(/_/g,' ') ?? ''}</td></tr>
    <tr><td>Term</td><td>${r.term}</td></tr>
    <tr><td>Academic Year</td><td>${r.academic_year}</td></tr>
    <tr><td>Payment Method</td><td style="text-transform:capitalize">${r.payment_method?.replace(/_/g,' ') ?? ''}</td></tr>
    ${r.reference ? `<tr><td>Reference / Teller</td><td>${r.reference}</td></tr>` : ''}
    ${r.notes     ? `<tr><td>Notes</td><td>${r.notes}</td></tr>` : ''}
    <tr><td>Date</td><td>${fmtDate(r.created_at)}</td></tr>
    <tr class="amount-row"><td>AMOUNT PAID</td><td>${fmtAmt(r.amount, r.currency)}</td></tr>
  </table>
  ${school?.account_number ? `
  <div class="bank">
    <strong>School Bank Account</strong>
    ${school.account_name}<br/>
    ${school.bank_name} · ${school.account_number}
  </div>` : ''}
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
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

  // ── Receipt detail view ───────────────────────────────────
  if (selected) return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Receipt">
      <button onClick={() => setSelected(null)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)',
          fontSize:'0.8rem', fontWeight:700, marginBottom:'var(--space-5)', padding:0 }}>
        ← Back to receipts
      </button>

      <div style={{ background:'var(--glass-bg)', border:`2px solid ${sc}40`,
        borderRadius:'var(--radius-xl)', padding:'var(--space-5)' }}>

        <div style={{ textAlign:'center', borderBottom:'1px solid var(--glass-border)',
          paddingBottom:'var(--space-4)', marginBottom:'var(--space-4)' }}>
          <p style={{ fontSize:'1rem', fontWeight:800, color:sc, margin:'0 0 2px' }}>
            {school?.name}
          </p>
          {school?.address && (
            <p style={{ fontSize:'0.73rem', color:'var(--text-muted)', margin:'0 0 10px' }}>
              {school.address}
            </p>
          )}
          <p style={{ fontSize:'0.68rem', fontWeight:800, letterSpacing:'0.12em',
            color:'var(--text-muted)', margin:'0 0 4px' }}>PAYMENT RECEIPT</p>
          <p style={{ fontSize:'0.9rem', fontWeight:800, color:sc, margin:0 }}>
            {selected.receipt_number}
          </p>
        </div>

        {([
          ['Student',        selected.student_name],
          ['Class',          selected.class_level],
          ['Fee Type',       selected.fee_type?.replace(/_/g,' ')],
          ['Term',           selected.term],
          ['Academic Year',  selected.academic_year],
          ['Payment Method', selected.payment_method?.replace(/_/g,' ')],
          selected.reference ? ['Reference / Teller', selected.reference] : null,
          selected.notes     ? ['Notes', selected.notes]                  : null,
          ['Date',           fmtDate(selected.created_at)],
        ] as any[]).filter(Boolean).map(([label, value]: [string, string]) => (
          <div key={label} style={{ display:'flex', justifyContent:'space-between',
            alignItems:'flex-start', padding:'9px 0',
            borderBottom:'1px solid var(--glass-border)' }}>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:0, flexShrink:0 }}>
              {label}
            </p>
            <p style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-primary)',
              margin:0, textTransform:'capitalize', textAlign:'right', maxWidth:'60%' }}>
              {value}
            </p>
          </div>
        ))}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          paddingTop:'var(--space-4)', marginTop:'var(--space-2)' }}>
          <p style={{ fontSize:'0.88rem', fontWeight:800, color:'var(--text-primary)', margin:0 }}>
            AMOUNT PAID
          </p>
          <p style={{ fontSize:'1.3rem', fontWeight:800, color:'#10B981', margin:0 }}>
            {fmtAmt(selected.amount, selected.currency)}
          </p>
        </div>

        {school?.account_number && (
          <div style={{ marginTop:'var(--space-4)', padding:'var(--space-3)',
            background:sc+'12', borderRadius:8 }}>
            <p style={{ fontSize:'0.68rem', fontWeight:800, color:'var(--text-muted)',
              letterSpacing:'0.06em', margin:'0 0 4px' }}>SCHOOL BANK ACCOUNT</p>
            <p style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-primary)',
              margin:'0 0 2px' }}>{school.account_name}</p>
            <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>
              {school.bank_name} · {school.account_number}
            </p>
          </div>
        )}
      </div>

      <button onClick={() => downloadReceipt(selected)}
        style={{ width:'100%', height:46, marginTop:'var(--space-5)',
          background:sc, color:'#fff', border:'none', borderRadius:10,
          fontWeight:700, fontSize:'0.88rem', cursor:'pointer' }}>
        ↓ Download / Print Receipt
      </button>

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )

  // ── List view ─────────────────────────────────────────────
  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Receipts">
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', alignItems:'center' }}>
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="2024/2025"
          style={{ height:40, padding:'0 12px', background:'var(--input-bg)',
            border:'1px solid var(--input-border)', borderRadius:8,
            color:'var(--text-primary)', fontSize:'0.82rem', outline:'none',
            width:110, flexShrink:0 }}/>
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

      {!loading && payments.length > 0 && (
        <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
          letterSpacing:'0.05em', marginBottom:'var(--space-3)' }}>
          {payments.length} RECEIPT{payments.length !== 1 ? 'S' : ''} · Tap to view or download
        </p>
      )}

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : payments.length === 0
          ? <div className={styles.empty}>
              <FileTextIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No receipts for {term} {year}</p>
            </div>
          : <div className={styles.list}>
              {payments.map((p: any) => (
                <div key={p.id} className={styles.card}
                  style={{ cursor:'pointer' }}>
                  <div style={{ display:'contents' }} onClick={() => setSelected(p)}>
                    <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                      <FileTextIcon size={16} color={sc}/>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{p.student_name}</p>
                      <p className={styles.cardMeta}>
                        {p.receipt_number} · {p.fee_type?.replace(/_/g,' ')}
                        {p.class_level ? ` · ${p.class_level}` : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end',
                    gap:4, flexShrink:0 }}>
                    <p style={{ fontSize:'0.88rem', fontWeight:800, color:'#10B981', margin:0 }}
                      onClick={() => setSelected(p)}>
                      {fmtAmt(p.amount, p.currency)}
                    </p>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}
                      onClick={() => setSelected(p)}>
                      {fmtShort(p.created_at)}
                    </p>
                    <button onClick={e => { e.stopPropagation(); downloadReceipt(p) }}
                      style={{ fontSize:'0.65rem', fontWeight:700, color:sc,
                        background:sc+'15', border:`1px solid ${sc}40`,
                        borderRadius:5, padding:'2px 7px', cursor:'pointer' }}>
                      ↓ PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
