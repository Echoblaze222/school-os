'use client'
// src/app/dashboard/bursar/debtors/DebtorsClient.tsx
//
// Fixed: was reading from `school_fees` and `fee_payments`, tables nothing
// writes to anymore. Now reads directly from `payment_invoices` — the same
// table InvoicesClient, RemindersClient, and the principal dashboard use —
// so debtor totals stay in sync with everything else in the app.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { PeopleIcon } from '@/components/Icons'
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

function currentTerm() {
  const m = new Date().getMonth()
  if (m >= 8) return 'First Term'
  if (m <= 2) return 'Second Term'
  return 'Third Term'
}

export default function DebtorsClient({ profile, school, userId }: Props) {
  const [debtors, setDebtors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [term,    setTerm]    = useState(currentTerm())
  const [year,    setYear]    = useState(CUR_YEAR)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { compute() }, [term, year])

  async function compute() {
    setLoading(true)
    setError('')
    const termKey = TERM_KEY_MAP[term] ?? 'first'

    const { data, error: err } = await supabase
      .from('payment_invoices')
      .select(`
        id, student_id, amount_due_ngn, amount_paid_ngn, balance_ngn, status,
        fee_structures ( term, academic_year ),
        profiles ( id, full_name, default_code, class_level, avatar_url )
      `)
      .eq('school_id', school?.id)

    if (err) {
      setError(err.message)
      setDebtors([])
      setLoading(false)
      return
    }

    // Aggregate per student — a student may have multiple invoices for the
    // same term (e.g. school fees + uniform + PTA), so sum across all of them.
    // Embeds can come back as object OR 1-element array, so unwrap before
    // reading, and verify term/year client-side since PostgREST doesn't
    // reliably apply filters on a 2nd-level nested embed.
    const byStudent = new Map<string, any>()
    for (const inv of (data ?? [])) {
      const fs = unwrapEmbed((inv as any).fee_structures)
      if (!fs || fs.term !== termKey || fs.academic_year !== year) continue

      const student = unwrapEmbed((inv as any).profiles)
      if (!student) continue

      if (!byStudent.has(student.id)) {
        byStudent.set(student.id, {
          id:           student.id,
          full_name:    student.full_name,
          default_code: student.default_code ?? '',
          class_level:  student.class_level ?? '',
          avatar_url:   student.avatar_url ?? null,
          expected:     0,
          paid:         0,
          outstanding:  0,
        })
      }
      const entry = byStudent.get(student.id)
      entry.expected    += inv.amount_due_ngn  ?? 0
      entry.paid        += inv.amount_paid_ngn ?? 0
      entry.outstanding += inv.balance_ngn     ?? 0
    }

    const result = Array.from(byStudent.values())
      .filter(d => d.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)

    setDebtors(result)
    setLoading(false)
  }

  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', {
      style:'currency', currency:'NGN', minimumFractionDigits:0
    }).format(n)
  }

  const totalOutstanding = debtors.reduce((s, d) => s + d.outstanding, 0)

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Debtors">
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

      {!loading && debtors.length > 0 && (
        <div style={{ padding:'var(--space-4)', background:'#EF444415',
          border:'1px solid #EF444430', borderRadius:10, marginBottom:'var(--space-4)' }}>
          <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
            letterSpacing:'0.05em', margin:'0 0 4px' }}>
            TOTAL OUTSTANDING — {debtors.length} STUDENT{debtors.length !== 1 ? 'S' : ''}
          </p>
          <p style={{ fontSize:'1.2rem', fontWeight:800, color:'#EF4444', margin:0 }}>
            {fmtAmt(totalOutstanding)}
          </p>
        </div>
      )}

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : debtors.length === 0
          ? <div className={styles.empty}>
              <PeopleIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No outstanding fees for {term} {year}</p>
            </div>
          : <div className={styles.list}>
              {debtors.map((d: any) => {
                const paidPct = d.expected > 0
                  ? Math.min(100, Math.round((d.paid / d.expected) * 100))
                  : 0
                return (
                  <div key={d.id} className={styles.card}>
                    <div className={styles.cardIcon}
                      style={{ background:'#EF444420', borderRadius:'50%', overflow:'hidden' }}>
                      {d.avatar_url
                        ? <img src={d.avatar_url} alt=""
                            style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                        : <span style={{ fontWeight:800, color:'#EF4444' }}>
                            {d.full_name?.[0]}
                          </span>}
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{d.full_name}</p>
                      <p className={styles.cardMeta}>{d.default_code} · {d.class_level}</p>
                      {d.expected > 0 && (
                        <div style={{ marginTop:5 }}>
                          <div style={{ height:4, background:'var(--glass-border)', borderRadius:2 }}>
                            <div style={{ height:'100%', width:`${paidPct}%`,
                              background:'#10B981', borderRadius:2 }}/>
                          </div>
                          <p style={{ fontSize:'0.67rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                            Paid {fmtAmt(d.paid)} of {fmtAmt(d.expected)}
                          </p>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ fontSize:'0.85rem', fontWeight:800, color:'#EF4444', margin:0 }}>
                        {fmtAmt(d.outstanding)}
                      </p>
                      <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>
                        outstanding
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
