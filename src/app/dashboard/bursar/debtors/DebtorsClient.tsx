'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { PeopleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

function currentTerm() {
  const m = new Date().getMonth()
  if (m >= 8) return 'First Term'
  if (m <= 2) return 'Second Term'
  return 'Third Term'
}

export default function DebtorsClient({ profile, school, userId }: Props) {
  const [debtors, setDebtors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [term,    setTerm]    = useState(currentTerm())
  const [year,    setYear]    = useState(CUR_YEAR)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { compute() }, [term, year])

  async function compute() {
    setLoading(true)
    const [{ data: students }, { data: feeStructures }, { data: payments }] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, default_code, class_level, avatar_url')
        .eq('school_id', school?.id).eq('role', 'student'),
      supabase.from('school_fees')
        .select('class_level, fee_type, amount')
        .eq('school_id', school?.id).eq('term', term).eq('academic_year', year),
      supabase.from('fee_payments')
        .select('student_id, amount')
        .eq('school_id', school?.id).eq('term', term).eq('academic_year', year),
    ])

    if (!students || !feeStructures || !payments) { setLoading(false); return }

    // Sum expected fees per class level
    const expected: Record<string, number> = {}
    for (const fee of feeStructures) {
      expected[fee.class_level] = (expected[fee.class_level] ?? 0) + (fee.amount ?? 0)
    }

    // Sum payments per student
    const paid: Record<string, number> = {}
    for (const p of payments) {
      if (p.student_id) paid[p.student_id] = (paid[p.student_id] ?? 0) + (p.amount ?? 0)
    }

    const result = students
      .map(s => ({
        ...s,
        expected:    expected[s.class_level] ?? 0,
        paid:        paid[s.id]              ?? 0,
        outstanding: (expected[s.class_level] ?? 0) - (paid[s.id] ?? 0),
      }))
      .filter(s => s.outstanding > 0)
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
