'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { FileTextIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

export default function ReceiptsClient({ profile, school, userId }: Props) {
  const [payments, setPayments] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [term,     setTerm]     = useState('First Term')
  const [year,     setYear]     = useState(CUR_YEAR)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term, year])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('fee_payments').select('*')
      .eq('school_id', school?.id).eq('term', term).eq('academic_year', year)
      .order('created_at', { ascending: false })
    if (data) setPayments(data)
    setLoading(false)
  }

  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', { style:'currency', currency:'NGN', minimumFractionDigits:0 }).format(n)
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' })
  }
  function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'short' })
  }

  // ── Receipt detail ────────────────────────────────────────
  if (selected) return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Receipt">
      <button onClick={() => setSelected(null)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)',
          fontSize:'0.8rem', fontWeight:700, marginBottom:'var(--space-5)', padding:0 }}>
        ← Back to receipts
      </button>

      <div style={{ background:'var(--glass-bg)', border:`2px solid ${sc}40`,
        borderRadius:'var(--radius-xl)', padding:'var(--space-5)' }}>

        {/* Header */}
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

        {/* Rows */}
        {([
          ['Student',         selected.student_name],
          ['Class',           selected.class_level],
          ['Fee Type',        selected.fee_type?.replace(/_/g,' ')],
          ['Term',            selected.term],
          ['Academic Year',   selected.academic_year],
          ['Payment Method',  selected.payment_method?.replace(/_/g,' ')],
          selected.reference ? ['Reference / Teller', selected.reference] : null,
          selected.notes     ? ['Notes', selected.notes]                  : null,
          ['Date',            fmtDate(selected.created_at)],
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

        {/* Amount */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          paddingTop:'var(--space-4)', marginTop:'var(--space-2)' }}>
          <p style={{ fontSize:'0.88rem', fontWeight:800, color:'var(--text-primary)', margin:0 }}>
            AMOUNT PAID
          </p>
          <p style={{ fontSize:'1.3rem', fontWeight:800, color:'#10B981', margin:0 }}>
            {fmtAmt(selected.amount)}
          </p>
        </div>

        {/* Bank info */}
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

      {!loading && payments.length > 0 && (
        <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
          letterSpacing:'0.05em', marginBottom:'var(--space-3)' }}>
          {payments.length} RECEIPT{payments.length !== 1 ? 'S' : ''} · Tap to view
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
                  onClick={() => setSelected(p)} style={{ cursor:'pointer' }}>
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
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:'0.88rem', fontWeight:800, color:'#10B981', margin:'0 0 2px' }}>
                      {fmtAmt(p.amount)}
                    </p>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>
                      {fmtShort(p.created_at)}
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
