'use client'
// src/app/dashboard/bursar/history/HistoryClient.tsx
//
// Fixed: was reading from `fee_payments`, a table nothing writes to anymore.
// Now reads from `payments` joined through payment_invoices -> fee_structures
// (for term/fee description) and profiles (for student name/class).

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon } from '@/components/Icons'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

const TERM_KEY_MAP: Record<string, string> = {
  'First Term': 'first', 'Second Term': 'second', 'Third Term': 'third',
}

function flatten(row: any) {
  // Embedded relations from Supabase can come back as either an object
  // or a 1-element array depending on inferred cardinality — unwrap both
  // shapes safely instead of assuming one or the other.
  const inv     = unwrapEmbed(row.payment_invoices)
  const fs      = unwrapEmbed(inv?.fee_structures)
  const student = unwrapEmbed(row['profiles!student_id'])
  return {
    id:             row.id,
    receipt_number: row.receipt_number,
    student_name:   student?.full_name ?? 'Unknown',
    class_level:    student?.class_level ?? '',
    fee_type:       fs?.description ?? 'School Fees',
    term:           fs?.term === 'first' ? 'First Term'
                   : fs?.term === 'second' ? 'Second Term'
                   : fs?.term === 'third' ? 'Third Term'
                   : fs?.term ?? '',
    created_at:     row.paid_at ?? row.created_at,
    amount:         row.currency_used === 'USD' ? row.amount_paid_usd : row.amount_paid_ngn,
    currency:       row.currency_used,
  }
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
}
const SHEET: React.CSSProperties = {
  width: '100%', maxWidth: 520,
  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
  borderRadius: '18px 18px 0 0', padding: '20px 20px 36px',
  maxHeight: '80vh', overflowY: 'auto',
}

export default function HistoryClient({ profile, school, userId }: Props) {
  const [payments, setPayments] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [year,     setYear]     = useState(CUR_YEAR)
  const [term,     setTerm]     = useState<string | null>(null)
  const [error,    setError]    = useState('')
  const [preview,  setPreview]  = useState<any | null>(null)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [year, term])

  async function load() {
    setLoading(true)
    setError('')

    let q = supabase
      .from('payments')
      .select(`
        id, receipt_number, paid_at, created_at, amount_paid_ngn, amount_paid_usd, currency_used,
        payment_invoices (
          fee_structures ( description, term, academic_year )
        ),
        profiles!student_id ( full_name, class_level )
      `)
      .eq('school_id', school?.id)
      .eq('payment_invoices.fee_structures.academic_year', year)
      .order('created_at', { ascending: false })
      .limit(100)

    if (term) q = q.eq('payment_invoices.fee_structures.term', TERM_KEY_MAP[term] ?? 'first')

    const { data, error: err } = await q

    if (err) {
      setError(err.message)
      setPayments([])
      setLoading(false)
      return
    }

    const flattened = (data ?? [])
      .filter((row: any) => {
        const inv = unwrapEmbed(row.payment_invoices)
        const fs  = unwrapEmbed(inv?.fee_structures)
        if (!fs || fs.academic_year !== year) return false
        if (term && fs.term !== (TERM_KEY_MAP[term] ?? 'first')) return false
        return true
      })
      .map(flatten)

    setPayments(flattened)
    setLoading(false)
  }

  function fmtAmt(n: number, currency: string = 'NGN') {
    if (currency === 'USD') {
      return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return new Intl.NumberFormat('en-NG', {
      style:'currency', currency:'NGN', minimumFractionDigits:0
    }).format(n ?? 0)
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG',
      { day:'numeric', month:'short', year:'numeric' })
  }

  const totalShown = payments.reduce((s, p) => s + (p.amount ?? 0), 0)

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="History">

      {/* ── Payment Preview Modal ── */}
      {preview && (
        <div style={OVERLAY} onClick={() => setPreview(null)}>
          <div style={SHEET} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto 18px' }}/>

            <p style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.07em', margin:'0 0 12px' }}>
              💳 PAYMENT RECORD
            </p>

            {/* Amount hero */}
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <p style={{ fontSize:'2rem', fontWeight:900, color:'#10B981', margin:0 }}>
                {fmtAmt(preview.amount, preview.currency)}
              </p>
              {preview.receipt_number && (
                <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:'4px 0 0' }}>
                  #{preview.receipt_number}
                </p>
              )}
            </div>

            {/* Detail rows */}
            {([
              ['Student',    preview.student_name],
              ['Class',      preview.class_level  || '—'],
              ['Fee Type',   preview.fee_type?.replace(/_/g,' ')],
              ['Term',       preview.term         || '—'],
              ['Currency',   preview.currency     || 'NGN'],
              ['Date',       fmtDate(preview.created_at)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--glass-border)' }}>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:600 }}>{label}</span>
                <span style={{ fontSize:'0.82rem', color:'var(--text-primary)', fontWeight:700, textAlign:'right', maxWidth:'60%' }}>{value}</span>
              </div>
            ))}

            <button onClick={() => setPreview(null)}
              style={{ width:'100%', height:42, marginTop:16,
                background:'var(--input-bg)', color:'var(--text-primary)',
                border:'1px solid var(--input-border)', borderRadius:10,
                fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', alignItems:'center' }}>
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="2024/2025"
          style={{ height:40, padding:'0 12px', background:'var(--input-bg)',
            border:'1px solid var(--input-border)', borderRadius:8,
            color:'var(--text-primary)', fontSize:'0.82rem', outline:'none',
            width:110, flexShrink:0 }}/>
        <div className={styles.subjectScroll} style={{ flex:1 }}>
          <button onClick={() => setTerm(null)}
            className={`${styles.subjectPill} ${!term ? styles.subjectPillActive : ''}`}
            style={!term ? { background:sc, borderColor:sc, color:'#fff' }
              : { borderColor:sc+'50', color:sc }}>
            All
          </button>
          {TERMS.map(t => (
            <button key={t} onClick={() => setTerm(t)}
              className={`${styles.subjectPill} ${term===t ? styles.subjectPillActive : ''}`}
              style={term===t ? { background:sc, borderColor:sc, color:'#fff' }
                : { borderColor:sc+'50', color:sc }}>
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
        <div style={{ padding:'var(--space-4)', background:sc+'15',
          border:`1px solid ${sc}30`, borderRadius:10, marginBottom:'var(--space-4)' }}>
          <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
            letterSpacing:'0.05em', margin:'0 0 4px' }}>
            TOTAL — {payments.length} PAYMENT{payments.length !== 1 ? 'S' : ''}
          </p>
          <p style={{ fontSize:'1.1rem', fontWeight:800, color:sc, margin:0 }}>
            {fmtAmt(totalShown)}
          </p>
        </div>
      )}

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : payments.length === 0
          ? <div className={styles.empty}>
              <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No payments recorded for {year}</p>
            </div>
          : <div className={styles.list}>
              {payments.map((p: any) => (
                <div key={p.id} className={styles.card}
                  style={{ cursor:'pointer' }}
                  onClick={() => setPreview(p)}>
                  <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                    <ClockIcon size={16} color={sc}/>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{p.student_name}</p>
                    <p className={styles.cardMeta}>
                      {p.term} · {p.fee_type?.replace(/_/g,' ')}
                      {p.class_level ? ` · ${p.class_level}` : ''}
                      {p.receipt_number ? ` · ${p.receipt_number}` : ''}
                    </p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:'0.88rem', fontWeight:800, color:'#10B981', margin:'0 0 2px' }}>
                      {fmtAmt(p.amount, p.currency)}
                    </p>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>
                      {fmtDate(p.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
